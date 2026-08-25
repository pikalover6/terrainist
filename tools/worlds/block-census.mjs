#!/usr/bin/env node
// Block census of a compiled world, read straight from the region files.
//
//   node tools/worlds/block-census.mjs <worldDir> [--bbox x0,z0,x1,z1] [--match <regex>] [--top N] [--json]
//
// Counts every block id (state properties dropped) inside the optional column
// bbox (inclusive, world x/z), and prints the top N or the ids matching the
// regex. This is the instrument behind "vines: 42,441 → 41,582" — a number a
// render cannot give. Reads the compiler's own output only: a save the client
// has opened is migrated to another region layout and reads as empty.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nbt = require("prismarine-nbt");

const args = process.argv.slice(2);
const worldDir = args.find((a) => !a.startsWith("--"));
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
if (!worldDir) {
  console.error("usage: block-census.mjs <worldDir> [--bbox x0,z0,x1,z1] [--match <regex>] [--top N] [--json]");
  process.exit(2);
}
const bbox = opt("--bbox") ? opt("--bbox").split(",").map(Number) : null;
const match = opt("--match") ? new RegExp(opt("--match")) : null;
const top = Number(opt("--top", 40));
const json = args.includes("--json");

const counts = new Map();
const add = (id, n) => counts.set(id, (counts.get(id) ?? 0) + n);

function chunksOf(file) {
  const buf = fs.readFileSync(file);
  const out = [];
  for (let i = 0; i < 1024; i++) {
    const off = ((buf[i * 4] << 16) | (buf[i * 4 + 1] << 8) | buf[i * 4 + 2]) * 4096;
    if (off === 0) continue;
    const len = buf.readUInt32BE(off);
    const kind = buf[off + 4];
    const raw = buf.subarray(off + 5, off + 4 + len);
    out.push(kind === 2 ? zlib.inflateSync(raw) : kind === 1 ? zlib.gunzipSync(raw) : raw);
  }
  return out;
}

const regionDir = path.join(worldDir, "region");
let chunks = 0;
for (const f of fs.readdirSync(regionDir).filter((f) => f.endsWith(".mca"))) {
  for (const data of chunksOf(path.join(regionDir, f))) {
    const root = nbt.parseUncompressed(data, "big").value;
    const cx = root.xPos.value, cz = root.zPos.value;
    const x0 = cx * 16, z0 = cz * 16;
    if (bbox && (x0 + 15 < bbox[0] || x0 > bbox[2] || z0 + 15 < bbox[1] || z0 > bbox[3])) continue;
    const whole = !bbox || (x0 >= bbox[0] && x0 + 15 <= bbox[2] && z0 >= bbox[1] && z0 + 15 <= bbox[3]);
    chunks++;
    for (const sec of root.sections.value.value) {
      const bs = sec.block_states?.value;
      if (!bs) continue;
      const palette = bs.palette.value.value.map((e) => e.Name.value);
      const longs = bs.data?.value;
      if (palette.length === 1 || !longs) {
        if (whole) add(palette[0], 4096);
        else {
          let n = 0;
          for (let i = 0; i < 4096; i++) {
            const x = x0 + (i & 15), z = z0 + ((i >> 4) & 15);
            if (x >= bbox[0] && x <= bbox[2] && z >= bbox[1] && z <= bbox[3]) n++;
          }
          add(palette[0], n);
        }
        continue;
      }
      const bits = Math.max(4, Math.ceil(Math.log2(palette.length)));
      const per = Math.floor(64 / bits);
      const mask = (1n << BigInt(bits)) - 1n;
      let i = 0;
      for (const [hi, lo] of longs) {
        let v = (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
        for (let k = 0; k < per && i < 4096; k++, i++) {
          const idx = Number(v & mask);
          v >>= BigInt(bits);
          if (!whole) {
            const x = x0 + (i & 15), z = z0 + ((i >> 4) & 15);
            if (x < bbox[0] || x > bbox[2] || z < bbox[1] || z > bbox[3]) continue;
          }
          add(palette[idx], 1);
        }
      }
    }
  }
}

const rows = [...counts.entries()]
  .filter(([id]) => !match || match.test(id))
  .sort((a, b) => b[1] - a[1])
  .slice(0, match ? 10_000 : top);
if (json) {
  console.log(JSON.stringify({ worldDir, bbox, chunks, counts: Object.fromEntries(rows) }));
} else {
  console.log(`${worldDir}  chunks=${chunks}${bbox ? `  bbox=${bbox.join(",")}` : ""}`);
  for (const [id, n] of rows) console.log(`  ${String(n).padStart(10)}  ${id}`);
}
