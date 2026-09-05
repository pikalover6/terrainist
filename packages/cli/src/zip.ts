import { createWriteStream } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { ZipFile } from "yazl";

const ZIP_TIMESTAMP = new Date("1980-01-01T00:00:00.000Z");

/**
 * Zip `worldDir` into `<worldDir>.zip`, with the world folder at the archive root.
 *
 * The writer streams files instead of buffering the world in memory and fixes
 * entry timestamps so packaging does not depend on the host clock.
 *
 * @returns the absolute path of the created archive.
 */
export async function zipWorld(worldDir: string): Promise<string> {
  const resolved = path.resolve(worldDir);
  const parent = path.dirname(resolved);
  const folder = path.basename(resolved);
  const zipPath = path.join(parent, `${folder}.zip`);

  await rm(zipPath, { force: true });

  const archive = new ZipFile();
  await addDirectory(archive, resolved, folder);

  const writing = pipeline(archive.outputStream, createWriteStream(zipPath));
  archive.end();
  await writing;

  return zipPath;
}

async function addDirectory(archive: ZipFile, directory: string, archivePath: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  if (entries.length === 0) {
    archive.addEmptyDirectory(archivePath, { mtime: ZIP_TIMESTAMP });
    return;
  }

  for (const entry of entries) {
    const sourcePath = path.join(directory, entry.name);
    const entryPath = `${archivePath}/${entry.name}`;
    if (entry.isDirectory()) {
      await addDirectory(archive, sourcePath, entryPath);
    } else if (entry.isFile()) {
      archive.addFile(sourcePath, entryPath, { mtime: ZIP_TIMESTAMP });
    } else {
      throw new Error(`cannot package unsupported filesystem entry: ${sourcePath}`);
    }
  }
}
