import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { zipWorld } from "../src/zip.js";

let scratch: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("zipWorld", () => {
  it("packages a world without a host zip executable", async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "terrainist-zip-"));
    const world = path.join(scratch, "test_world");
    await mkdir(path.join(world, "region"), { recursive: true });
    await writeFile(path.join(world, "level.dat"), "level");
    await writeFile(path.join(world, "region", "r.0.0.mca"), "region");
    vi.stubEnv("PATH", "");

    const zipPath = await zipWorld(world);
    const first = await readFile(zipPath);
    expect(first.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    await utimes(path.join(world, "level.dat"), new Date(), new Date());
    await zipWorld(world);
    expect(await readFile(zipPath)).toEqual(first);
  });
});
