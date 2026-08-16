/**
 * Copy the textures `src/textures.js` actually asks for out of an unpacked
 * RE:Fi release, and nothing else.
 *
 * RE:Fi ships ~4,500 files across dozens of mod folders; a viewer that wants a
 * few hundred should vendor a few hundred. This script is the record of how
 * `textures/refi/` was produced, and re-running it after a table edit is how it
 * grows.
 *
 *   node tools/vendor-textures.mjs --pack <unpacked refi_textures dir> [--check]
 *
 * `--check` reports without writing, which is how you find a filename the
 * table guessed wrong: a miss is not fatal (the block falls back to flat
 * colour) but it is almost always a typo rather than a decision.
 *
 * Names are flattened to their basename. The script fails loudly if two source
 * files would collide, because a silent winner there is a wrong texture.
 */

import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { textureOf, resolveFaces } from "../src/textures.js";
import { blockNameUniverse, exportedPalettes } from "./block-names.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.join(here, "..", "textures", "refi");

function arg(flag) {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}

/** Every `.png` under `dir`, basename → full path. */
async function indexPack(dir) {
  const found = new Map();
  const collisions = new Map();
  const walk = async (at) => {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".png")) {
        if (found.has(entry.name)) {
          collisions.set(entry.name, [found.get(entry.name), full]);
        } else {
          found.set(entry.name, full);
        }
      }
    }
  };
  await walk(dir);
  return { found, collisions };
}

/**
 * A texture the atlas can use: square, or a vertical animation strip whose
 * frames are square (the atlas takes the first frame). Anything else — a GUI
 * sheet, an armour layer — would smear across neighbouring cells.
 */
async function isSquareTile(file) {
  const { size } = await stat(file);
  if (size === 0) return false;
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(file);
  // PNG IHDR: width and height are big-endian u32 at offsets 16 and 20.
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return { width, height, square: width > 0 && height % width === 0 };
}

async function main() {
  const pack = arg("--pack");
  const check = process.argv.includes("--check");
  if (pack === undefined) throw new Error("vendor-textures: --pack <dir> is required");

  const { found, collisions } = await indexPack(path.resolve(pack));
  const names = blockNameUniverse(await exportedPalettes());
  const wanted = new Set();
  const byBlock = new Map();
  for (const name of names) {
    const faces = resolveFaces(textureOf(name));
    if (faces === undefined) continue;
    byBlock.set(name, faces);
    for (const file of faces) if (file !== undefined) wanted.add(file);
  }

  const missing = [];
  const nonSquare = [];
  const copied = [];
  if (!check) await mkdir(outDir, { recursive: true });

  for (const file of [...wanted].sort()) {
    const source = found.get(file);
    if (source === undefined) {
      missing.push(file);
      continue;
    }
    if (collisions.has(file)) {
      throw new Error(`vendor-textures: two files named ${file} in the pack`);
    }
    const shape = await isSquareTile(source);
    if (shape === false || !shape.square) {
      nonSquare.push(`${file} (${shape === false ? "empty" : `${shape.width}x${shape.height}`})`);
      continue;
    }
    if (!check) await copyFile(source, path.join(outDir, file));
    copied.push(file);
  }

  if (!check) {
    await writeFile(
      path.join(outDir, "FILES.txt"),
      `${copied.join("\n")}\n`,
      "utf8",
    );
  }

  const blocksWithAny = [...byBlock.entries()].filter(([, faces]) =>
    faces.some((file) => file !== undefined && copied.includes(file)),
  );
  console.log(`block names considered   ${names.length}`);
  console.log(`textures requested       ${wanted.size}`);
  console.log(`textures vendored        ${copied.length}`);
  console.log(`blocks with a texture    ${blocksWithAny.length}`);
  if (nonSquare.length > 0) {
    console.log(`\nskipped, not a square tile (${nonSquare.length}):`);
    for (const file of nonSquare) console.log(`  ${file}`);
  }
  if (missing.length > 0) {
    console.log(`\nnot in the pack (${missing.length}) — these blocks stay flat-coloured:`);
    for (const file of missing) console.log(`  ${file}`);
  }
  if (!check) console.log(`\nwrote ${outDir}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});

export { indexPack };
export const VENDOR_OUT_DIR = outDir;
export const packExists = (dir) => existsSync(dir);
