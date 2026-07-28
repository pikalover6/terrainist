/**
 * `terrainist install` tests.
 *
 * Everything here runs against a temp `--saves` directory. The real Minecraft
 * saves folder is never read and never written — not by these tests, not by
 * anything but an explicit user invocation.
 */

import { cp, mkdtemp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { emitWorld, loadSpikeDocument, readGzippedNbt } from "@terrainist/compiler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  defaultSavesDir,
  installWorld,
  longToMillis,
  millisToLong,
} from "../src/install.js";

const SPEC_PATH = fileURLToPath(new URL("../../../examples/pyramid.spike.json", import.meta.url));

const scratch: string[] = [];
let sourceWorld: string;

async function scratchDir(label: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-${label}-`));
  scratch.push(dir);
  return dir;
}

/** Every file under `dir`, relative and sorted. */
async function fileList(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...(await fileList(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

/** `level.dat` as a simplified NBT object. */
async function levelData(worldDir: string): Promise<Record<string, unknown>> {
  const raw = await readFile(path.join(worldDir, "level.dat"));
  const parsed = readGzippedNbt(raw) as { Data: Record<string, unknown> };
  return parsed.Data;
}

beforeAll(async () => {
  const dir = await scratchDir("install-src");
  const doc = await loadSpikeDocument(SPEC_PATH);
  const summary = await emitWorld(doc, path.join(dir, doc.name));
  sourceWorld = summary.worldDir;
});

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

describe("installWorld", () => {
  it("copies the world into the saves dir and stamps LastPlayed", async () => {
    const saves = await scratchDir("saves");
    const before = Date.now();
    const result = await installWorld({ worldDir: sourceWorld, savesDir: saves });
    const after = Date.now();

    expect(result.savesDir).toBe(path.resolve(saves));
    expect(result.folderName).toBe(path.basename(sourceWorld));
    expect(result.renamed).toBe(false);
    expect(result.installedPath).toBe(path.join(path.resolve(saves), result.folderName));
    expect(result.lastPlayed).toBeGreaterThanOrEqual(before);
    expect(result.lastPlayed).toBeLessThanOrEqual(after);

    const installed = await levelData(result.installedPath);
    const stamped = longToMillis(installed["LastPlayed"] as [number, number]);
    expect(stamped).toBeGreaterThan(0);
    expect(stamped).toBe(result.lastPlayed);

    // The emitted artifact itself is untouched: still deterministic.
    const original = await levelData(sourceWorld);
    expect(longToMillis(original["LastPlayed"] as [number, number])).toBe(0);
  });

  it("changes nothing else about the world", async () => {
    const saves = await scratchDir("saves-identical");
    const result = await installWorld({ worldDir: sourceWorld, savesDir: saves, now: 1_700_000_000_123 });

    expect(await fileList(result.installedPath)).toEqual(await fileList(sourceWorld));

    // Every file except level.dat is byte-identical.
    for (const rel of await fileList(sourceWorld)) {
      if (rel === "level.dat") continue;
      expect(
        await readFile(path.join(result.installedPath, rel)),
        `${rel} should be byte-identical`,
      ).toEqual(await readFile(path.join(sourceWorld, rel)));
    }

    // level.dat differs in LastPlayed and nothing else.
    const original = await levelData(sourceWorld);
    const installed = await levelData(result.installedPath);
    expect(longToMillis(installed["LastPlayed"] as [number, number])).toBe(1_700_000_000_123);
    expect({ ...installed, LastPlayed: original["LastPlayed"] }).toEqual(original);
  });

  it("refuses to overwrite, appending -2 and -3", async () => {
    const saves = await scratchDir("saves-collide");
    const first = await installWorld({ worldDir: sourceWorld, savesDir: saves });
    const second = await installWorld({ worldDir: sourceWorld, savesDir: saves });
    const third = await installWorld({ worldDir: sourceWorld, savesDir: saves });

    expect(first.folderName).toBe(path.basename(sourceWorld));
    expect(second.folderName).toBe(`${first.folderName}-2`);
    expect(third.folderName).toBe(`${first.folderName}-3`);
    expect(second.renamed).toBe(true);

    // The first install is intact.
    expect(await fileList(first.installedPath)).toEqual(await fileList(sourceWorld));
  });

  it("creates the saves directory when it does not exist", async () => {
    const parent = await scratchDir("saves-missing");
    const saves = path.join(parent, "nested", "saves");
    const result = await installWorld({ worldDir: sourceWorld, savesDir: saves });
    expect((await stat(result.installedPath)).isDirectory()).toBe(true);
  });

  it("rejects a directory that is not a world", async () => {
    const saves = await scratchDir("saves-reject");
    const notAWorld = path.join(saves, "empty");
    await mkdir(notAWorld, { recursive: true });
    await expect(installWorld({ worldDir: notAWorld, savesDir: saves })).rejects.toThrow(
      /not a Minecraft world folder/,
    );
  });

  it("rejects a level.dat with no Data compound", async () => {
    const saves = await scratchDir("saves-badlevel");
    const broken = path.join(await scratchDir("broken-world"), "broken");
    await cp(sourceWorld, broken, { recursive: true });
    await rm(path.join(broken, "level.dat"));
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(broken, "level.dat"), zlib.gzipSync(Buffer.from([0x0a, 0x00, 0x00, 0x00])));
    await expect(installWorld({ worldDir: broken, savesDir: saves })).rejects.toThrow(
      /no Data compound/,
    );
  });
});

describe("millisToLong", () => {
  it("round-trips through longToMillis", () => {
    for (const ms of [0, 1, 4_294_967_295, 4_294_967_296, 1_700_000_000_123, Date.now()]) {
      expect(longToMillis(millisToLong(ms))).toBe(ms);
    }
  });

  it("clamps negatives to zero", () => {
    expect(millisToLong(-5)).toEqual([0, 0]);
  });
});

describe("defaultSavesDir", () => {
  it("names a saves folder for this platform", () => {
    expect(defaultSavesDir().endsWith(path.join("saves"))).toBe(true);
    expect(defaultSavesDir()).toContain("minecraft");
  });
});
