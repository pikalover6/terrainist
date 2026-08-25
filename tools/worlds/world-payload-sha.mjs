#!/usr/bin/env node
// A world's identity, independent of the compression stream.
//
//   node tools/worlds/world-payload-sha.mjs <worldDir> [<worldDir>...]
//
// sha256 over the DECOMPRESSED level.dat and every chunk payload, in region
// and chunk-slot order. Two worlds with the same payload sha hold the same
// blocks; the raw .mca and level.dat bytes may still differ, because the zlib
// stream is not stable across Node upgrades (2026-08-25: Node 26.5 → 26.7
// changed every compressed byte of every world while every payload stayed
// identical). Byte-identity work compares this, not the files.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

function chunkPayloads(file) {
  const buf = fs.readFileSync(file);
  const out = [];
  for (let i = 0; i < 1024; i++) {
    const off = ((buf[i * 4] << 16) | (buf[i * 4 + 1] << 8) | buf[i * 4 + 2]) * 4096;
    if (off === 0) {
      out.push(null);
      continue;
    }
    const len = buf.readUInt32BE(off);
    const kind = buf[off + 4];
    const raw = buf.subarray(off + 5, off + 4 + len);
    out.push(kind === 2 ? zlib.inflateSync(raw) : kind === 1 ? zlib.gunzipSync(raw) : Buffer.from(raw));
  }
  return out;
}

export function worldPayloadSha(worldDir) {
  const h = crypto.createHash("sha256");
  const level = path.join(worldDir, "level.dat");
  if (fs.existsSync(level)) {
    const raw = fs.readFileSync(level);
    h.update("level.dat\n");
    h.update(raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw);
  }
  const regionDir = path.join(worldDir, "region");
  const regions = fs.existsSync(regionDir) ? fs.readdirSync(regionDir).filter((f) => f.endsWith(".mca")).sort() : [];
  for (const r of regions) {
    h.update(`region/${r}\n`);
    const payloads = chunkPayloads(path.join(regionDir, r));
    for (let i = 0; i < 1024; i++) {
      const p = payloads[i];
      if (p === null) continue;
      h.update(`chunk ${i}\n`);
      h.update(p);
    }
  }
  return h.digest("hex");
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  for (const dir of process.argv.slice(2)) console.log(`${worldPayloadSha(dir).slice(0, 16)}  ${dir}`);
}
