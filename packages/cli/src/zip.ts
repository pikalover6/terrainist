/**
 * World folder → `.zip`.
 *
 * Shells out to the system `zip` so the archive is a plain, stored-directory
 * zip that Minecraft's launcher and every unzipper handle. It zips the world
 * folder *by name from its parent*, so the archive contains
 * `glass-pyramid/level.dat` etc. and unzips straight into `saves/`.
 *
 * Portability note: this needs Info-ZIP's `zip` on PATH (present on macOS and
 * most Linux distros, absent on stock Windows). Fine for the G1 spike; swap in
 * a JS zip writer when the web product needs it.
 */

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Zip `worldDir` into `<worldDir>.zip`, with the world folder at the archive root.
 *
 * @returns the absolute path of the created archive.
 */
export async function zipWorld(worldDir: string): Promise<string> {
  const resolved = path.resolve(worldDir);
  const parent = path.dirname(resolved);
  const folder = path.basename(resolved);
  const zipPath = path.join(parent, `${folder}.zip`);

  // `zip` appends to an existing archive; start clean.
  await rm(zipPath, { force: true });

  try {
    // -r recurse, -q quiet, -X drop platform extra fields.
    await execFileAsync("zip", ["-r", "-q", "-X", zipPath, folder], { cwd: parent });
  } catch (cause) {
    throw new Error(
      `failed to run \`zip\` (needed to package ${folder}); is Info-ZIP installed?`,
      { cause },
    );
  }

  return zipPath;
}
