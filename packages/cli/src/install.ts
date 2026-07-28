/**
 * Installing a compiled world into a Minecraft saves directory.
 *
 * This is the **one** place in Terrainist where the wall clock is allowed in,
 * and it is deliberately at the very last boundary: the emitted artifact stays
 * byte-identical run to run, and only the copy sitting in `saves/` gets a
 * `LastPlayed` stamp. Minecraft sorts the world list by `LastPlayed`, and a
 * world stamped 0 sorts to the bottom of a long list where nobody finds it.
 *
 * Existing worlds are never overwritten: a name collision picks `-2`, `-3`,
 * and so on. Losing somebody's save to a generated one is not a tradeoff worth
 * making for the convenience of a stable path.
 */

import { access, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);

/** Result of an install. */
export interface InstallResult {
  /** Where the world now lives. */
  readonly installedPath: string;
  /** The folder name actually used (may carry a `-2` suffix). */
  readonly folderName: string;
  /** The saves directory it went into. */
  readonly savesDir: string;
  /** The `LastPlayed` value written, in epoch milliseconds. */
  readonly lastPlayed: number;
  /** True when the requested name was taken and a suffix was added. */
  readonly renamed: boolean;
}

/** Options for {@link installWorld}. */
export interface InstallOptions {
  /** The compiled world folder to copy. */
  readonly worldDir: string;
  /** Target saves directory; defaults to the platform Minecraft saves path. */
  readonly savesDir?: string;
  /** Override the stamp (tests); defaults to `Date.now()`. */
  readonly now?: number;
}

/** The default Minecraft saves directory for this platform. */
export function defaultSavesDir(): string {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "minecraft", "saves");
    case "win32":
      return path.join(process.env["APPDATA"] ?? path.join(home, "AppData", "Roaming"), ".minecraft", "saves");
    default:
      return path.join(home, ".minecraft", "saves");
  }
}

/**
 * Copy `worldDir` into the saves directory and stamp its `LastPlayed`.
 *
 * @returns where it landed and what was stamped.
 */
export async function installWorld(options: InstallOptions): Promise<InstallResult> {
  const worldDir = path.resolve(options.worldDir);
  const savesDir = path.resolve(options.savesDir ?? defaultSavesDir());

  await assertIsWorld(worldDir);
  await mkdir(savesDir, { recursive: true });

  const requested = path.basename(worldDir);
  const folderName = await freeName(savesDir, requested);
  const installedPath = path.join(savesDir, folderName);

  await cp(worldDir, installedPath, { recursive: true, errorOnExist: true, force: false });

  const lastPlayed = options.now ?? Date.now();
  await stampLastPlayed(path.join(installedPath, "level.dat"), lastPlayed);

  return {
    installedPath,
    folderName,
    savesDir,
    lastPlayed,
    renamed: folderName !== requested,
  };
}

/**
 * Rewrite `level.dat` with a new `LastPlayed`, leaving every other tag alone.
 *
 * The file is parsed, one long is replaced, and it is re-serialized — no
 * byte patching, so the result stays a valid NBT document whatever the schema
 * does next.
 */
export async function stampLastPlayed(levelDatPath: string, millis: number): Promise<void> {
  const nbt = require("prismarine-nbt") as {
    parseUncompressed(buf: Buffer): NbtNode;
    writeUncompressed(value: NbtNode): Buffer;
  };

  const root = nbt.parseUncompressed(zlib.gunzipSync(await readFile(levelDatPath)));
  const data = (root.value as Record<string, NbtNode> | undefined)?.["Data"];
  if (data === undefined || data.type !== "compound" || typeof data.value !== "object") {
    throw new Error(`${levelDatPath} has no Data compound — is this really a level.dat?`);
  }
  (data.value as Record<string, NbtNode>)["LastPlayed"] = {
    type: "long",
    value: millisToLong(millis),
  };

  await writeFile(levelDatPath, zlib.gzipSync(nbt.writeUncompressed(root)));
}

/** Split epoch millis into prismarine-nbt's `[high, low]` signed int32 pair. */
export function millisToLong(millis: number): [number, number] {
  const value = Math.max(0, Math.floor(millis));
  const high = Math.floor(value / 2 ** 32);
  const low = (value % 2 ** 32) | 0;
  return [high, low];
}

/** Reassemble a `[high, low]` pair into a number. */
export function longToMillis(pair: readonly [number, number]): number {
  const [high, low] = pair;
  return high * 2 ** 32 + (low >>> 0);
}

/* -------------------------------------------------------------------------- */

/** Minimal shape of a prismarine-nbt node. */
interface NbtNode {
  type: string;
  value?: unknown;
}

async function assertIsWorld(worldDir: string): Promise<void> {
  try {
    await access(path.join(worldDir, "level.dat"));
  } catch {
    throw new Error(`${worldDir} is not a Minecraft world folder (no level.dat)`);
  }
}

/** The first of `name`, `name-2`, `name-3`, … that does not exist in `dir`. */
async function freeName(dir: string, name: string): Promise<string> {
  const existing = new Set(await readdir(dir).catch(() => [] as string[]));
  if (!existing.has(name)) return name;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${name}-${n}`;
    if (!existing.has(candidate)) return candidate;
  }
  /* c8 ignore next */
  throw new Error(`could not find a free name for "${name}" in ${dir}`);
}
