/**
 * Installing a compiled world into a Minecraft saves directory.
 *
 * This is the **one** place in Terrainist where the wall clock is allowed in,
 * and it is deliberately at the very last boundary: the emitted artifact stays
 * byte-identical run to run, and only the copy sitting in `saves/` gets a
 * `LastPlayed` stamp. Minecraft sorts the world list by `LastPlayed`, and a
 * world stamped 0 sorts to the bottom of a long list where nobody finds it.
 *
 * Existing worlds are never overwritten by default: a name collision picks
 * `-2`, `-3`, and so on. Losing somebody's save to a generated one is not a
 * tradeoff worth making for the convenience of a stable path — but iterating on
 * a world is exactly the case where a stable path is what you want, and a saves
 * folder with nine copies of the same village in it is its own kind of data
 * loss. `replace: true` is that opt-in: it deletes the same-named folder and
 * copies the new one into the same place, so the world keeps its identity in
 * the client's list. It is never the default and it is never implied.
 */

import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
  /** True when an existing same-name save was deleted to make room. */
  readonly replaced: boolean;
}

/** Options for {@link installWorld}. */
export interface InstallOptions {
  /** The compiled world folder to copy. */
  readonly worldDir: string;
  /** Target saves directory; defaults to the platform Minecraft saves path. */
  readonly savesDir?: string;
  /** Override the stamp (tests); defaults to `Date.now()`. */
  readonly now?: number;
  /** Delete an existing same-name save and take its place, instead of suffixing. */
  readonly replace?: boolean;
  /**
   * Skip the "is Minecraft holding this save open?" check. Escape hatch for a
   * stale lock; it is never what you want while the game is actually running.
   */
  readonly force?: boolean;
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
  const replace = options.replace === true;
  const folderName = replace ? requested : await freeName(savesDir, requested);
  const installedPath = path.join(savesDir, folderName);
  if (installedPath === worldDir) {
    throw new Error(`${installedPath} is the world being installed — nothing to do`);
  }

  // Delete rather than copy over: a stale region file from the previous build
  // that this one no longer writes would survive a merge and leave the save a
  // chimera of two compiles.
  let replaced = false;
  if (replace) {
    try {
      await access(installedPath);
      replaced = true;
    } catch {
      replaced = false;
    }
    if (replaced && options.force !== true) await assertNotOpenInMinecraft(installedPath);
    if (replaced) await rm(installedPath, { recursive: true, force: true });
  }

  await cp(worldDir, installedPath, { recursive: true, errorOnExist: true, force: false });

  const lastPlayed = options.now ?? Date.now();
  await stampLastPlayed(path.join(installedPath, "level.dat"), lastPlayed);

  return {
    installedPath,
    folderName,
    savesDir,
    lastPlayed,
    renamed: folderName !== requested,
    replaced,
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

/**
 * Refuse to replace a save that Minecraft currently has open.
 *
 * This is the guard for the one way Terrainist has actually destroyed a world.
 * Modern Minecraft (26.x) does not keep world-gen settings in `level.dat` any
 * more: on first open it upgrades the save's file structure and moves them out
 * to `data/minecraft/world_gen_settings.dat`, leaving a slim `level.dat` that
 * no longer carries a `WorldGenSettings` tag at all. `replace: true` deletes
 * the save folder — including that sidecar — and copies our freshly emitted
 * world in. If the game is running with that world loaded, none of the deletion
 * is visible to it: it still holds its own in-memory level data, and when the
 * player quits it writes that back out. The folder is then a chimera — a 26.x
 * `level.dat` with no `WorldGenSettings`, no `data/minecraft/world_gen_settings.dat`
 * to supply one, and our region files underneath — and the world can never be
 * opened again, in any version:
 *
 *     Unable to read or access the world gen settings file!
 *     java.lang.IllegalStateException: Overworld settings missing
 *
 * The save cannot be repaired from the client, so this has to be caught before
 * the `rm`. `session.lock` is the file the game holds an exclusive lock on for
 * exactly this purpose; Node cannot test an advisory lock directly, so we ask
 * the operating system who has the file open. If we cannot ask — no `lsof`, an
 * unusual platform — we let the install through rather than block a legitimate
 * one on a check we could not perform.
 */
async function assertNotOpenInMinecraft(installedPath: string): Promise<void> {
  const lockPath = path.join(installedPath, "session.lock");
  try {
    await access(lockPath);
  } catch {
    return; // Never opened by the game; nothing can be holding it.
  }
  if (!(await isFileOpenByAProcess(lockPath))) return;

  throw new Error(
    `${installedPath} is open in Minecraft right now — refusing to replace it.\n` +
      "Replacing a save the game has loaded destroys it: the game rewrites level.dat on\n" +
      "quit and the world gen settings it moved to data/minecraft/ are already gone, which\n" +
      'leaves an unopenable world ("Overworld settings missing").\n' +
      "Quit to the title screen (or close the game), then run the install again.",
  );
}

/** Ask the OS whether any process holds `file` open. `false` when it cannot be asked. */
async function isFileOpenByAProcess(file: string): Promise<boolean> {
  if (process.platform === "win32") return false;
  const { execFile } = await import("node:child_process");
  return await new Promise<boolean>((resolve) => {
    // `lsof -t` prints one pid per line and exits 1 when nothing has it open.
    execFile("lsof", ["-t", "--", file], (error, stdout) => {
      if (error !== null && stdout.trim() === "") {
        // Exit 1 with no output is "nobody has it"; a missing lsof is ENOENT,
        // and both land here. Neither is grounds for blocking the install.
        resolve(false);
        return;
      }
      resolve(stdout.trim() !== "");
    });
  });
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
