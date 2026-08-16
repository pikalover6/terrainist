/**
 * The web export, as assertions.
 *
 * Three properties matter and nothing else in this file is worth much:
 *
 * 1. The coding is *lossless* — palette + RLE + header round-trip to the same
 *    cells, or the viewer draws a world that was never compiled.
 * 2. The export is *deterministic* — same document, byte-identical bytes. The
 *    whole project's ground rule, and the thing that makes an export cacheable
 *    behind a CDN.
 * 3. The y trim is *tight and correct* — every chunk stores exactly the layers
 *    it uses, with the lowest stored layer at `minY`. Getting this wrong shifts
 *    a chunk vertically against its neighbours, which reads as a cliff.
 */

import { readFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { afterAll, describe, expect, it } from "vitest";

import {
  decodeChunk,
  decodeRle,
  encodeChunk,
  encodeRle,
  exportWebWorld,
  promptOf,
  WEB_CHUNK_WIDTH,
  WEB_EXPORT_FORMAT,
  type WebManifest,
} from "../src/export/web.js";

const scratch: string[] = [];
afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

/** A tiny island: two exports of this are what determinism is asserted on. */
function smallDocument(): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "terrain",
    meta: { name: "web_export_isle", worldSeed: 7, prompt: "a small test isle for the web export" },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [64, 64] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: {
            amplitude: 24,
            seaLevel: 63,
            baseHeight: 70,
            continentalness: { frequency: 0.006, seaFraction: 0.35 },
          },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
      ],
    },
  };
}

async function exportSmall(label: string): Promise<{ dir: string; manifest: WebManifest }> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-webexport-${label}-`));
  scratch.push(dir);
  await exportWebWorld(smallDocument(), { outDir: dir });
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as WebManifest;
  return { dir, manifest };
}

describe("palette + RLE coding", () => {
  it("round-trips arbitrary cells at one byte per index", () => {
    const cells = new Uint16Array(1000);
    for (let i = 0; i < cells.length; i++) cells[i] = (i % 7 === 0 ? 3 : i % 13) % 200;
    const decoded = decodeRle(encodeRle(cells, 1), 1, cells.length);
    expect(Array.from(decoded)).toEqual(Array.from(cells));
  });

  it("round-trips a palette wider than a byte", () => {
    const cells = new Uint16Array(500);
    for (let i = 0; i < cells.length; i++) cells[i] = 250 + (i % 300);
    const decoded = decodeRle(encodeRle(cells, 2), 2, cells.length);
    expect(Array.from(decoded)).toEqual(Array.from(cells));
  });

  it("splits a run longer than a u16 rather than truncating it", () => {
    const cells = new Uint16Array(70_000).fill(5);
    const encoded = encodeRle(cells, 1);
    expect(encoded.byteLength).toBe(2 * 3); // two runs, three bytes each
    expect(Array.from(decodeRle(encoded, 1, cells.length))).toEqual(Array.from(cells));
  });

  it("round-trips a whole chunk, header and all", () => {
    const height = 40;
    const cells = new Uint16Array(WEB_CHUNK_WIDTH * WEB_CHUNK_WIDTH * height);
    for (let i = 0; i < cells.length; i++) cells[i] = i % 5 === 0 ? 0 : (i % 11) + 1;
    const chunk = { chunkX: -3, chunkZ: 12, minY: -64, height, cells };
    const decoded = decodeChunk(encodeChunk(chunk, 1));
    expect(decoded.chunkX).toBe(-3);
    expect(decoded.chunkZ).toBe(12);
    expect(decoded.minY).toBe(-64);
    expect(decoded.height).toBe(height);
    expect(Array.from(decoded.cells)).toEqual(Array.from(cells));
  });

  it("refuses a payload that is not a chunk", () => {
    expect(() => decodeChunk(new Uint8Array(32))).toThrow(/magic/);
  });
});

describe("exporting a compiled document", () => {
  it("writes a manifest, chunk files and a palette whose index 0 is air", async () => {
    const { dir, manifest } = await exportSmall("shape");
    expect(manifest.format).toBe(WEB_EXPORT_FORMAT);
    expect(manifest.name).toBe("web_export_isle");
    expect(manifest.prompt).toBe("a small test isle for the web export");
    expect(manifest.palette[0]).toBe("air");
    expect(manifest.solid[0]).toBe(false);
    expect(manifest.palette.length).toBe(manifest.solid.length);
    expect(manifest.palette).toContain("stone");
    expect(manifest.chunks.length).toBeGreaterThan(0);
    for (const entry of manifest.chunks) {
      expect(existsSync(path.join(dir, entry.file))).toBe(true);
    }
    // A 64x64 region is 4x4 chunks; nothing outside it should be indexed.
    for (const entry of manifest.chunks) {
      expect(entry.x).toBeGreaterThanOrEqual(-2);
      expect(entry.x).toBeLessThanOrEqual(2);
    }
  }, 120_000);

  it("trims every chunk to the layers it actually uses", async () => {
    const { dir, manifest } = await exportSmall("trim");
    for (const entry of manifest.chunks.slice(0, 6)) {
      const chunk = decodeChunk(gunzipSync(await readFile(path.join(dir, entry.file))));
      expect(chunk.minY).toBe(entry.minY);
      expect(chunk.height).toBe(entry.height);
      expect(chunk.cells.length).toBe(WEB_CHUNK_WIDTH * WEB_CHUNK_WIDTH * entry.height);

      // The bottom layer holds bedrock, and both extreme layers must contain
      // something: a trim that kept an all-air layer is not a tight trim.
      const nonAirIn = (layer: number): number => {
        let count = 0;
        for (let column = 0; column < WEB_CHUNK_WIDTH * WEB_CHUNK_WIDTH; column++) {
          if (chunk.cells[column * chunk.height + layer] !== 0) count++;
        }
        return count;
      };
      expect(nonAirIn(0)).toBeGreaterThan(0);
      expect(nonAirIn(chunk.height - 1)).toBeGreaterThan(0);
      expect(chunk.minY).toBeGreaterThanOrEqual(manifest.bounds.minY);
      expect(chunk.minY + chunk.height - 1).toBeLessThanOrEqual(manifest.bounds.maxY);
    }
  }, 120_000);

  it("is byte-identical across two exports of the same document", async () => {
    const first = await exportSmall("det-a");
    const second = await exportSmall("det-b");
    expect(await readFile(path.join(first.dir, "manifest.json"), "utf8")).toBe(
      await readFile(path.join(second.dir, "manifest.json"), "utf8"),
    );
    for (const entry of first.manifest.chunks) {
      const a = await readFile(path.join(first.dir, entry.file));
      const b = await readFile(path.join(second.dir, entry.file));
      expect(a.equals(b)).toBe(true);
    }
  }, 240_000);
});

/**
 * The hero export, when it is on disk. Skipped rather than failed when it is
 * not: it is a build artifact (`tools/web-viewer/worlds/` is gitignored), and a
 * test suite that demands one would be red on a fresh checkout.
 */
describe("the hero export on disk", () => {
  const heroDir = path.resolve(
    import.meta.dirname,
    "../../../tools/web-viewer/worlds/isles_of_war",
  );
  const present = existsSync(path.join(heroDir, "manifest.json"));

  it.skipIf(!present)("decodes, and its chunks agree with the manifest", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(heroDir, "manifest.json"), "utf8"),
    ) as WebManifest;
    // The prefix, not the exact tag: `worlds/` is a build artifact and an
    // export from before a minor bump must still load.
    expect(manifest.format.startsWith("terrainist-web-world/")).toBe(true);
    expect(manifest.name).toBe("isles_of_war");
    expect(manifest.palette[0]).toBe("air");
    expect(manifest.palette.length).toBeGreaterThan(50);
    expect(manifest.bytesPerIndex === 1 || manifest.bytesPerIndex === 2).toBe(true);
    if (manifest.bytesPerIndex === 1) expect(manifest.palette.length).toBeLessThanOrEqual(256);

    // The spawn must be inside the exported bounds, or the viewer opens in the
    // void looking at nothing.
    const [sx, sy, sz] = manifest.spawn;
    expect(sx).toBeGreaterThanOrEqual(manifest.bounds.minX);
    expect(sx).toBeLessThanOrEqual(manifest.bounds.maxX);
    expect(sz).toBeGreaterThanOrEqual(manifest.bounds.minZ);
    expect(sz).toBeLessThanOrEqual(manifest.bounds.maxZ);
    expect(sy).toBeGreaterThan(manifest.seaLevel);

    // The chunk holding the spawn: it exists, it decodes, and the column under
    // the spawn is standing on something.
    const spawnChunk = manifest.chunks.find(
      (c) => c.x === Math.floor(sx / 16) && c.z === Math.floor(sz / 16),
    );
    expect(spawnChunk).toBeDefined();
    const chunk = decodeChunk(gunzipSync(await readFile(path.join(heroDir, spawnChunk!.file))));
    expect(chunk.cells.length).toBe(16 * 16 * chunk.height);
    const localX = sx - chunk.chunkX * 16;
    const localZ = sz - chunk.chunkZ * 16;
    const under = chunk.cells[(localX * 16 + localZ) * chunk.height + (sy - 1 - chunk.minY)];
    expect(under).toBeGreaterThan(0);
    expect(manifest.palette[under as number]).not.toBe("air");

    // Every index in the chunk is a real palette entry.
    let max = 0;
    for (const value of chunk.cells) if (value > max) max = value;
    expect(max).toBeLessThan(manifest.palette.length);
  });
});

/**
 * The prompt, which the landing page types out before the world fades in.
 *
 * It is the only field in the manifest that is *optional*, so the two things
 * worth pinning are that a document carrying one gets it through unchanged and
 * that a document without one produces a manifest byte-identical to what the
 * format wrote before the field existed.
 */
describe("the prompt in the manifest", () => {
  it("takes meta.prompt, trims it, and ignores anything that is not text", () => {
    expect(promptOf({ meta: { prompt: "  two isles at war  " } })).toBe("two isles at war");
    expect(promptOf({ meta: { prompt: "" } })).toBeUndefined();
    expect(promptOf({ meta: { prompt: "   " } })).toBeUndefined();
    expect(promptOf({ meta: { prompt: 7 } })).toBeUndefined();
    expect(promptOf({ meta: {} })).toBeUndefined();
    expect(promptOf({})).toBeUndefined();
    expect(promptOf(null)).toBeUndefined();
    expect(promptOf("a document, allegedly")).toBeUndefined();
  });

  it("omits the key entirely for a document with no prompt", async () => {
    const doc = smallDocument();
    delete (doc.meta as Record<string, unknown>).prompt;
    const dir = await mkdtemp(path.join(tmpdir(), "terrainist-webexport-noprompt-"));
    scratch.push(dir);
    await exportWebWorld(doc, { outDir: dir });
    const text = await readFile(path.join(dir, "manifest.json"), "utf8");
    expect(text).not.toContain("prompt");
    expect(JSON.parse(text).prompt).toBeUndefined();
  }, 120_000);

  it("announces the minor version, and stays under the same major", () => {
    expect(WEB_EXPORT_FORMAT).toBe("terrainist-web-world/1.1");
    expect(WEB_EXPORT_FORMAT.startsWith("terrainist-web-world/1")).toBe(true);
  });
});
