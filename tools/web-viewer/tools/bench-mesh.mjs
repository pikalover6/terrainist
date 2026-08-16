/**
 * What the initial load area costs, measured off a real export.
 *
 * The browser numbers behind `?bench=1` are the ones that matter, and nobody
 * can run a browser in CI — so this is the same mesher, on the same chunks, in
 * node, with merging on and off. It answers the only question a reviewer of the
 * greedy pass should ask: how much less geometry, and at what cost in time.
 *
  *   node tools/bench-mesh.mjs [--world worlds/<name>] [--radius 6]
 *
 * Timings here are *not* the browser's: node is meshing on one thread with no
 * GPU upload and no frame to hit. Treat the triangle counts as exact and the
 * milliseconds as a ratio.
 */

import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import process from "node:process";

import { WorldView } from "../src/format.js";
import { resolvePalette, texturesFor } from "../src/appearance.js";
import { atlasLayout } from "../src/atlas.js";
import { meshSection } from "../src/mesher.js";
import { decodeChunk } from "../src/format.js";

const here = path.dirname(new URL(import.meta.url).pathname);

function arg(flag, fallback) {
  const at = process.argv.indexOf(flag);
  return at === -1 ? fallback : process.argv[at + 1];
}

async function main() {
  const worldDir = path.resolve(here, "..", arg("--world", "worlds/unicorn_pirate_isles"));
  const radius = Number(arg("--radius", "6"));
  const manifest = JSON.parse(await readFile(path.join(worldDir, "manifest.json"), "utf8"));

  const layout = atlasLayout(texturesFor(manifest.palette));
  const palette = resolvePalette(manifest.palette, manifest.solid, layout);
  const world = new WorldView(manifest);

  const [sx, , sz] = manifest.spawn;
  const cx = Math.floor(sx / 16);
  const cz = Math.floor(sz / 16);
  const index = new Map(manifest.chunks.map((entry) => [`${entry.x},${entry.z}`, entry]));

  // One extra ring is loaded but not meshed, so every meshed chunk sees real
  // neighbours: a chunk meshed at the edge of nothing has extra faces and
  // would flatter both numbers equally but neither honestly.
  const loadable = [];
  for (let dx = -radius - 1; dx <= radius + 1; dx++) {
    for (let dz = -radius - 1; dz <= radius + 1; dz++) {
      const entry = index.get(`${cx + dx},${cz + dz}`);
      if (entry !== undefined) loadable.push({ entry, distance: Math.hypot(dx, dz) });
    }
  }

  const decodeStart = performance.now();
  let bytes = 0;
  for (const { entry } of loadable) {
    const gz = await readFile(path.join(worldDir, entry.file));
    bytes += gz.byteLength;
    world.put(decodeChunk(new Uint8Array(gunzipSync(gz))));
  }
  const decodeMs = performance.now() - decodeStart;

  const meshable = loadable.filter(({ distance }) => distance <= radius);
  const sample = (x, y, z) => world.indexAt(x, y, z);

  const run = (merge) => {
    let ms = 0;
    let worst = 0;
    let triangles = 0;
    let quads = 0;
    for (const { entry } of meshable) {
      const started = performance.now();
      const first = Math.floor(entry.minY / 16);
      const last = Math.floor((entry.minY + entry.height - 1) / 16);
      for (let section = first; section <= last; section++) {
        const built = meshSection(sample, palette, entry.x * 16, section * 16, entry.z * 16, {
          merge,
        });
        triangles += built.opaque.triangles + built.transparent.triangles;
        quads += built.opaque.quads + built.transparent.quads;
      }
      const took = performance.now() - started;
      ms += took;
      if (took > worst) worst = took;
    }
    return { ms, worst, triangles, quads };
  };

  run(true); // warm the JIT, so the first arm is not measuring compilation
  const naive = run(false);
  const greedy = run(true);

  const row = (label, value) => console.log(`${label.padEnd(28)}${value}`);
  console.log(`world      ${path.basename(worldDir)}`);
  console.log(`spawn      chunk ${cx},${cz}   radius ${radius}`);
  console.log(`chunks     ${meshable.length} meshed, ${loadable.length} loaded\n`);
  row("decode ms (all chunks)", decodeMs.toFixed(1));
  row("decode ms / chunk", (decodeMs / loadable.length).toFixed(2));
  row("payload MB", (bytes / 1024 / 1024).toFixed(2));
  console.log();
  row("naive quads", naive.quads.toLocaleString());
  row("greedy quads", greedy.quads.toLocaleString());
  row("quads removed", `${(100 * (1 - greedy.quads / naive.quads)).toFixed(1)}%`);
  row("naive triangles", naive.triangles.toLocaleString());
  row("greedy triangles", greedy.triangles.toLocaleString());
  row("triangles removed", `${(100 * (1 - greedy.triangles / naive.triangles)).toFixed(1)}%`);
  console.log();
  row("naive mesh ms (total)", naive.ms.toFixed(1));
  row("greedy mesh ms (total)", greedy.ms.toFixed(1));
  row("naive mesh ms / chunk", (naive.ms / meshable.length).toFixed(2));
  row("greedy mesh ms / chunk", (greedy.ms / meshable.length).toFixed(2));
  row("naive worst chunk ms", naive.worst.toFixed(2));
  row("greedy worst chunk ms", greedy.worst.toFixed(2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
