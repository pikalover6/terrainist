/**
 * The acceptance harness of `docs/COHERENT-SOURCE-v0.md` — the probes that
 * hold every build to the two laws. A build that fails any probe does not
 * ship, does not install, and does not get argued with.
 *
 * usage: node tools/root-poc/verify.mjs <outDir>
 *   where <outDir> holds `manifest.json` and the world dir `troy_rootpoc/`.
 */

import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const { loadPrismarine, EMIT_MINECRAFT_VERSION } = await import(path.join(ROOT, "packages/compiler/dist/index.js"));

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node tools/root-poc/verify.mjs <outDir>");
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(path.join(outDir, "manifest.json"), "utf8"));
const regionDir = path.join(outDir, "troy_rootpoc", "region");

const mc = loadPrismarine(EMIT_MINECRAFT_VERSION);
const cache = new Map();
const nm = (id) => {
  let c = cache.get(id);
  if (c === undefined) { c = (mc.blockNameByStateId(id) ?? "").replace("minecraft:", ""); cache.set(id, c); }
  return c;
};
const anvil = mc.openAnvil(regionDir);
const loaded = new Map();
async function blockAt(x, y, z) {
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  const key = cx + "," + cz;
  let ch = loaded.get(key);
  if (ch === undefined) { ch = await anvil.load(cx, cz).catch(() => null); loaded.set(key, ch); }
  if (!ch) return "";
  return nm(ch.getBlockStateId(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16));
}
const GROUNDY = new Set([
  "grass_block", "dirt", "coarse_dirt", "dirt_path", "gravel", "sand", "stone",
  "sandstone", "smooth_sandstone", "cut_sandstone", "andesite", "tuff",
]);
async function surfaceY(x, z) {
  for (let y = 120; y >= 40; y--) {
    const n = await blockAt(x, y, z);
    if (n === "" || n === "air" || n === "cave_air" || n === "water") continue;
    if (n.includes("leaves") || n.includes("log") || n.includes("grass") && n !== "grass_block") continue;
    return y;
  }
  return -1;
}

const failures = [];
const note = (probe, msg) => failures.push(`${probe}: ${msg}`);

/* --- PROBE 1: no lips — no path over grass anywhere in the world ---------- */
{
  let paths = 0, lips = 0;
  const w = [];
  for (let cx = Math.floor(manifest.region.x0 / 16); cx < (manifest.region.x0 + manifest.region.width) / 16; cx++) {
    for (let cz = Math.floor(manifest.region.z0 / 16); cz < (manifest.region.z0 + manifest.region.depth) / 16; cz++) {
      const ch = await anvil.load(cx, cz).catch(() => null);
      if (!ch) continue;
      for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) for (let y = 50; y <= 115; y++) {
        if (nm(ch.getBlockStateId(lx, y, lz)) !== "dirt_path") continue;
        paths++;
        if (nm(ch.getBlockStateId(lx, y - 1, lz)) === "grass_block") {
          lips++;
          if (w.length < 5) w.push([cx * 16 + lx, y, cz * 16 + lz]);
        }
      }
    }
  }
  if (lips > 0) note("no-lips", `${lips}/${paths} path blocks stand on grass ${JSON.stringify(w)}`);
  else console.log(`no-lips        OK  (${paths} path blocks, 0 on grass)`);
}

/* --- PROBE 2: grade law — every route steps -1/0/+1 along its line -------- */
{
  let worst = 0, breaks = 0;
  const w = [];
  for (const route of manifest.routes) {
    let prev = null;
    for (const [x, z] of route) {
      const y = await surfaceY(x, z);
      if (y < manifest.sea) { prev = null; continue; }
      if (prev !== null && Math.abs(y - prev) > 1) {
        breaks++;
        worst = Math.max(worst, Math.abs(y - prev));
        if (w.length < 5) w.push([x, z, prev, y]);
      }
      prev = y;
    }
  }
  if (breaks > 0) note("grade-law", `${breaks} route steps exceed ±1 (worst ${worst}) ${JSON.stringify(w)}`);
  else console.log("grade-law      OK  (every route step within ±1)");
}

/* --- PROBE 3: no interpenetration — site rects pairwise disjoint ---------- */
{
  let hits = 0;
  const s = manifest.sites;
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
    const a = s[i], b = s[j];
    if (a.x0 <= b.x0 + b.sx + 1 && a.x0 + a.sx + 1 >= b.x0 && a.z0 <= b.z0 + b.sz + 1 && a.z0 + a.sz + 1 >= b.z0) {
      hits++;
      note("no-overlap", `${a.archetype}@(${a.x0},${a.z0}) vs ${b.archetype}@(${b.x0},${b.z0})`);
    }
  }
  if (hits === 0) console.log(`no-overlap     OK  (${s.length} sites pairwise disjoint)`);
}

/* --- PROBE 4: wall continuity — consecutive base deltas ≤ 1 --------------- */
{
  const ring = manifest.wallRing;
  let breaks = 0;
  const w = [];
  for (let i = 1; i < ring.length; i++) {
    const [ax, az, ay] = ring[i - 1];
    const [bx, bz, by] = ring[i];
    if (Math.abs(ax - bx) > 1 || Math.abs(az - bz) > 1) continue; // gate gap
    if (Math.abs(ay - by) > 1) {
      breaks++;
      if (w.length < 5) w.push([bx, bz, ay, by]);
    }
  }
  if (breaks > 0) note("wall-base", `${breaks} adjacent wall cells jump >1 ${JSON.stringify(w)}`);
  else console.log(`wall-base      OK  (${ring.length} ring cells, no jump >1)`);
}

/* --- PROBE 5: wall stands on ground — no wall block over air -------------- */
{
  let floats = 0;
  const w = [];
  for (const [x, z, base] of manifest.wallRing) {
    const below = await blockAt(x, base, z);
    if (below === "air" || below === "" || below === "water") {
      floats++;
      if (w.length < 5) w.push([x, base, z]);
    }
  }
  if (floats > 0) note("wall-footing", `${floats} wall cells stand over air/water ${JSON.stringify(w)}`);
  else console.log("wall-footing   OK  (every wall cell on solid ground)");
}

if (anvil.close) await anvil.close();

if (failures.length > 0) {
  console.error("\nVERIFY FAILED:");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("\nVERIFY OK — the build obeys the laws.");
