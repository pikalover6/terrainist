// Ground-coherence probe: compiles an archived doc in-process (groundEquivalence on),
// reads a compiled world's walkable surface, and cross-attributes every
// discontinuity to the ground subsystem that owns each column. The world dir must
// be the compiler's own output (pre-client-upgrade): an installed save the client
// has opened is migrated to a different region layout and reads as empty.
//
// usage: node ground-probe.mjs <docPath> <worldDir> <label>
import fs from "node:fs";
import path from "node:path";

const { compileTerrain, listChunks, loadPrismarine, EMIT_MINECRAFT_VERSION } =
  await import(new URL("../../packages/compiler/dist/index.js", import.meta.url));

const [docPath, worldDir, label] = process.argv.slice(2);
const doc = JSON.parse(fs.readFileSync(docPath, "utf8"));

// ---------------------------------------------------------------- compile
let artifacts = null;
const res = await compileTerrain(doc, {
  outDir: "/dev/null-unused",
  skipEmit: true,
  onArtifacts: (a) => { artifacts = a; },
  groundEquivalence: true,
  allowUnstable: true,
});
const ge = res.groundEquivalence;
if (!ge) { console.error("no groundEquivalence on result"); process.exit(1); }
const { baseline, intents, resolved, written } = ge;
const finalPlan = artifacts.plan;
const region = baseline.region;
const W = region.width, H = region.depth;
const idxOf = (x, z) => (z - region.z0) * W + (x - region.x0);
const xOf = (i) => region.x0 + (i % W);
const zOf = (i) => region.z0 + Math.floor(i / W);

// class letters for ASCII maps
const CLS = {
  "fluid.channel": "C", "building.footprint": "B", "precinct.ground": "P",
  "structure.linework": "L", "plaza.ground": "Z", "plaza.well": "w",
  "courtyard.floor": "Y", "retaining.seam": "S", "retaining.skirt": "K",
  "street.network": "R", "street.sidewalk": "W", "road.network": "D",
  "sweep.run": "V", "doorstep.landing": "T", "farm.parcel": "F",
  "prop.pad": "O", "verge": "G", "pad.record": "A",
};
const ownerClass = (i) => {
  const o = resolved.owner[i];
  return o >= 0 ? intents[o].sourceClass : "natural";
};
const ownerLetter = (i) => {
  const o = resolved.owner[i];
  return o >= 0 ? (CLS[intents[o].sourceClass] ?? "?") : ".";
};

// settlement bbox = bounds of owned columns, padded
let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9, ownedCount = 0;
for (let i = 0; i < resolved.owner.length; i++) {
  if (resolved.owner[i] < 0) continue;
  ownedCount++;
  const x = xOf(i), z = zOf(i);
  if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
  if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
}
bx0 = Math.max(bx0 - 8, region.x0); bz0 = Math.max(bz0 - 8, region.z0);
bx1 = Math.min(bx1 + 8, region.x0 + W - 1); bz1 = Math.min(bz1 + 8, region.z0 + H - 1);
const inB = (x, z) => x >= bx0 && x <= bx1 && z >= bz0 && z <= bz1;

console.log(`=== ${label} ===`);
console.log(`region x[${region.x0},${region.x0 + W - 1}] z[${region.z0},${region.z0 + H - 1}]  owned columns: ${ownedCount}  bbox x[${bx0},${bx1}] z[${bz0},${bz1}]`);
console.log(`intents: ${intents.length}`);
const byClass = new Map();
for (const it of intents) byClass.set(it.sourceClass, (byClass.get(it.sourceClass) ?? 0) + 1);
console.log("  " + [...byClass.entries()].map(([c, n]) => `${c}:${n}`).join("  "));
const colsByClass = new Map();
for (let i = 0; i < resolved.owner.length; i++) {
  const o = resolved.owner[i];
  if (o < 0) continue;
  const c = intents[o].sourceClass;
  colsByClass.set(c, (colsByClass.get(c) ?? 0) + 1);
}
console.log("columns won, by class: " + [...colsByClass.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join("  "));

// ---------------------------------------------------------------- world surface
const DECOR = new Set(["short_grass","tall_grass","grass","fern","large_fern","dandelion","poppy","azure_bluet","oxeye_daisy","cornflower","lily_of_the_valley","allium","blue_orchid","tulip","red_tulip","white_tulip","orange_tulip","pink_tulip","torch","lantern","wall_torch","snow","dead_bush","sweet_berry_bush","air","cave_air","vine","pink_petals","wildflowers","bush","firefly_bush","short_dry_grass","tall_dry_grass","leaf_litter","oak_leaves","birch_leaves","spruce_leaves","jungle_leaves","acacia_leaves","dark_oak_leaves","cherry_leaves","azalea_leaves","flowering_azalea_leaves","mangrove_leaves","pale_oak_leaves","oak_log","birch_log","spruce_log","jungle_log","acacia_log","dark_oak_log","cherry_log","pale_oak_log","mangrove_log","oak_sapling","banner","white_banner","red_banner","blue_banner","candle","flower_pot","potted_poppy","scaffolding","ladder","chain","iron_bars","oak_fence","spruce_fence","birch_fence","rail"]);
const WATERY = new Set(["water","lava","kelp","kelp_plant","seagrass","tall_seagrass","lily_pad","ice","packed_ice","blue_ice"]);
const regionDir = path.join(path.resolve(worldDir), "region");
const chunks = await listChunks(regionDir);
const mc = loadPrismarine(EMIT_MINECRAFT_VERSION);
const anvil = mc.openAnvil(regionDir);
const nameCache = new Map();
const resolveName = (id) => {
  let c = nameCache.get(id);
  if (c === undefined) { const n = mc.blockNameByStateId(id); c = (n ?? "").replace("minecraft:", ""); nameCache.set(id, c); }
  return c;
};
const surfY = new Int32Array(W * H).fill(-9999);
const surfName = new Array(W * H);
for (const { chunkX, chunkZ } of chunks) {
  const cx0 = chunkX * 16, cz0 = chunkZ * 16;
  if (cx0 > bx1 || cz0 > bz1 || cx0 + 15 < bx0 || cz0 + 15 < bz0) continue;
  const chunk = await anvil.load(chunkX, chunkZ);
  if (chunk === null) continue;
  for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
    const x = cx0 + lx, z = cz0 + lz;
    if (x < bx0 || z < bz0 || x > bx1 || z > bz1) continue;
    if (x < region.x0 || z < region.z0 || x >= region.x0 + W || z >= region.z0 + H) continue;
    const top = chunk.highestBlock(lx, lz);
    if (top === null) continue;
    let y = top.y;
    let name = resolveName(chunk.getBlockStateId(lx, y, lz));
    while (DECOR.has(name) && y > -60) { y--; name = resolveName(chunk.getBlockStateId(lx, y, lz)); }
    const i = idxOf(x, z);
    surfY[i] = y; surfName[i] = name;
  }
}

// ---------------------------------------------------------------- sanity: world vs plan
const sanity = new Map();
let sanN = 0;
for (let z = Math.max(bz0, region.z0); z <= Math.min(bz1, region.z0 + H - 1); z++) {
  for (let x = Math.max(bx0, region.x0); x <= Math.min(bx1, region.x0 + W - 1); x++) {
    const i = idxOf(x, z);
    if (surfY[i] === -9999) continue;
    if (finalPlan.fluidKind[i] !== 0) continue; // wet columns: surface is seabed vs fluidTop, skip
    const d = surfY[i] - finalPlan.ground[i];
    sanity.set(d, (sanity.get(d) ?? 0) + 1); sanN++;
  }
}
console.log(`\n-- sanity: worldSurface − finalPlan.ground (dry cols, n=${sanN}; >0 = structure standing on ground) --`);
console.log("  " + [...sanity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d, c]) => `${d >= 0 ? "+" + d : d}:${c}`).join("  "));

// ---------------------------------------------------------------- pipeline-stage deltas
const stageHist = (a, b) => {
  const h = new Map();
  for (let i = 0; i < a.length; i++) { const d = b[i] - a[i]; if (d !== 0) h.set(d, (h.get(d) ?? 0) + 1); }
  return h;
};
const fmtHist = (h, cap = 14) => [...h.entries()].sort((x, y) => y[1] - x[1]).slice(0, cap).map(([d, c]) => `${d > 0 ? "+" + d : d}:${c}`).join("  ") || "(none)";
console.log(`\n-- written(after structures) vs resolved(contract answer): nonzero cols by delta --`);
const wr = stageHist(resolved.ground, written.ground);
let wrTotal = 0; for (const c of wr.values()) wrTotal += c;
console.log(`  total ${wrTotal}: ${fmtHist(wr)}`);
// attribute divergence by owner class
const divByClass = new Map();
for (let i = 0; i < written.ground.length; i++) {
  if (written.ground[i] === resolved.ground[i]) continue;
  const c = ownerClass(i);
  divByClass.set(c, (divByClass.get(c) ?? 0) + 1);
}
console.log("  by owner: " + ([...divByClass.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join("  ") || "(none)"));
console.log(`\n-- finalPlan vs written: ground moved AFTER the structure pass (programs/scatter) --`);
const fw = stageHist(written.ground, finalPlan.ground);
let fwTotal = 0; for (const c of fw.values()) fwTotal += c;
console.log(`  total ${fwTotal}: ${fmtHist(fw)}`);

// ---------------------------------------------------------------- cliff census (walk experience)
// GROUND cliffs: |Δ finalPlan.ground| >= 2 between adjacent dry columns, excluding
// columns carrying a structure (world surface > ground+1: building walls/roofs are
// legitimate verticals, not ground defects).
const isBuilt = (i) => surfY[i] !== -9999 && surfY[i] > finalPlan.ground[i] + 1;
const gY = finalPlan.ground;
const dry = (i) => finalPlan.fluidKind[i] === 0;
const cliffEdges = [];
const pairHist = new Map();
for (let z = bz0; z <= bz1; z++) {
  for (let x = bx0; x <= bx1; x++) {
    const i = idxOf(x, z);
    if (!dry(i) || isBuilt(i)) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const x2 = x + dx, z2 = z + dz;
      if (!inB(x2, z2)) continue;
      const j = idxOf(x2, z2);
      if (!dry(j) || isBuilt(j)) continue;
      const d = gY[j] - gY[i];
      if (Math.abs(d) < 2) continue;
      const [hi, lo] = d > 0 ? [j, i] : [i, j];
      const key = `${ownerClass(hi)} over ${ownerClass(lo)}`;
      const e = pairHist.get(key) ?? { n: 0, maxDrop: 0, sum: 0 };
      e.n++; e.maxDrop = Math.max(e.maxDrop, Math.abs(d)); e.sum += Math.abs(d);
      pairHist.set(key, e);
      // ignore natural-over-natural far outside town for clustering
      if (ownerClass(hi) !== "natural" || ownerClass(lo) !== "natural")
        cliffEdges.push({ x, z, d, hi, lo });
    }
  }
}
console.log(`\n-- GROUND cliff census: adjacent dry |Δ finalPlan.ground|>=2, built cols excluded (higher-class over lower-class) --`);
const rows = [...pairHist.entries()].sort((a, b) => b[1].n - a[1].n);
for (const [k, e] of rows.slice(0, 20))
  console.log(`  ${String(e.n).padStart(6)}  avg ${(e.sum / e.n).toFixed(1)}  max ${String(e.maxDrop).padStart(2)}   ${k}`);

// ---------------------------------------------------------------- building seat audit
// group building.footprint claims by intent; measure floor vs surrounding ring in the WORLD
console.log(`\n-- building seat audit: building floor vs surrounding world surface --`);
const buildings = [];
for (let t = 0; t < intents.length; t++) {
  const it = intents[t];
  if (it.sourceClass !== "building.footprint") continue;
  const cols = [];
  try { for (const c of it.columns) cols.push(c); } catch { /* exhausted */ }
  if (cols.length === 0) continue;
  const set = new Set(cols.map((c) => c.idx));
  const ys = cols.map((c) => c.y).sort((a, b) => a - b);
  const floorY = ys[Math.floor(ys.length / 2)];
  const ring = [];
  for (const c of cols) {
    const x = xOf(c.idx), z = zOf(c.idx);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!inB(x + dx, z + dz)) continue;
      const j = idxOf(x + dx, z + dz);
      if (set.has(j)) continue;
      if (!dry(j) || isBuilt(j)) continue;
      ring.push(gY[j]);
    }
  }
  if (ring.length === 0) continue;
  ring.sort((a, b) => a - b);
  const ringMed = ring[Math.floor(ring.length / 2)];
  const ringMax = ring[ring.length - 1];
  buildings.push({ source: it.source, floorY, ringMed, ringMax, sink: ringMed - floorY, worst: ringMax - floorY, n: cols.length });
}
const sinkHist = new Map();
for (const b of buildings) sinkHist.set(b.sink, (sinkHist.get(b.sink) ?? 0) + 1);
console.log(`  ${buildings.length} buildings; ringMedian − floorY histogram (positive = building BELOW surrounding ground):`);
console.log("  " + [...sinkHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d > 0 ? "+" + d : d}:${c}`).join("  "));
console.log(`  worst 12 by ring-median sink:`);
for (const b of [...buildings].sort((a, b) => b.sink - a.sink).slice(0, 12))
  console.log(`    sink +${b.sink} (worst edge +${b.worst})  floorY ${b.floorY}  ${b.source}  (${b.n} cols)`);

// ---------------------------------------------------------------- street flank audit
console.log(`\n-- street flank: neighbourSurf − streetSurf for street.network cols vs non-street neighbours --`);
const flank = new Map(); // class -> Map(delta->count)
for (let z = bz0; z <= bz1; z++) {
  for (let x = bx0; x <= bx1; x++) {
    const i = idxOf(x, z);
    if (ownerClass(i) !== "street.network" || !dry(i)) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!inB(x + dx, z + dz)) continue;
      const j = idxOf(x + dx, z + dz);
      const c = ownerClass(j);
      if (c === "street.network" || !dry(j) || isBuilt(j)) continue;
      const d = gY[j] - gY[i];
      let m = flank.get(c); if (!m) { m = new Map(); flank.set(c, m); }
      m.set(d, (m.get(d) ?? 0) + 1);
    }
  }
}
for (const [c, m] of [...flank.entries()].sort((a, b) => { let ta = 0, tb = 0; for (const v of a[1].values()) ta += v; for (const v of b[1].values()) tb += v; return tb - ta; })) {
  let tot = 0; for (const v of m.values()) tot += v;
  const line = [...m.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d > 0 ? "+" + d : d}:${n}`).join(" ");
  console.log(`  ${c.padEnd(20)} n=${String(tot).padStart(6)}  ${line}`);
}

// ---------------------------------------------------------------- worst clusters + ASCII
// cluster cliff edges (Chebyshev<=2), rank by count*avgDrop, print maps for top 2
const byCell = new Map();
for (const e of cliffEdges) {
  const k = `${e.x}|${e.z}`;
  if (!byCell.has(k)) byCell.set(k, []);
  byCell.get(k).push(e);
}
const seen = new Set();
const clusters = [];
for (const e of cliffEdges) {
  const k0 = `${e.x}|${e.z}`;
  if (seen.has(k0)) continue;
  const stack = [k0]; const members = [];
  while (stack.length) {
    const k = stack.pop();
    if (seen.has(k) || !byCell.has(k)) continue;
    seen.add(k);
    members.push(...byCell.get(k));
    const [cx, cz] = k.split("|").map(Number);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const kk = `${cx + dx}|${cz + dz}`;
      if (!seen.has(kk) && byCell.has(kk)) stack.push(kk);
    }
  }
  let score = 0; for (const m of members) score += Math.abs(m.d);
  clusters.push({ members, score });
}
clusters.sort((a, b) => b.score - a.score);
console.log(`\n-- ${clusters.length} cliff clusters; top 6 by total drop --`);
for (const c of clusters.slice(0, 6)) {
  const xs = c.members.map((m) => m.x), zs = c.members.map((m) => m.z);
  const cx = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), cz = Math.round(zs.reduce((a, b) => a + b, 0) / zs.length);
  const kinds = new Map();
  for (const m of c.members) {
    const k = `${ownerClass(m.d > 0 ? m.hi : m.hi)}/${ownerClass(m.lo)}`;
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  console.log(`  score ${c.score}  edges ${c.members.length}  center (${cx},${cz})  ${[...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k}:${n}`).join(" ")}`);
}

const asciiAround = (cx, cz, r = 22) => {
  console.log(`\n  ASCII owner map around (${cx},${cz})  [letters=owner class, .=natural]`);
  let hdr = "      "; for (let x = cx - r; x <= cx + r; x++) hdr += String(Math.abs(x) % 10);
  console.log(hdr);
  for (let z = cz - r; z <= cz + r; z++) {
    let row = String(z).padStart(5) + " ";
    for (let x = cx - r; x <= cx + r; x++) row += ownerLetter(idxOf(x, z));
    console.log(row);
  }
  console.log(`\n  world surface Y (mod 10) same window; '~'=water, ' '=missing`);
  console.log(hdr);
  for (let z = cz - r; z <= cz + r; z++) {
    let row = String(z).padStart(5) + " ";
    for (let x = cx - r; x <= cx + r; x++) {
      const i = idxOf(x, z);
      row += surfY[i] === -9999 ? " " : WATERY.has(surfName[i]) ? "~" : String(((surfY[i] % 10) + 10) % 10);
    }
    console.log(row);
  }
  // cross-section through cz
  console.log(`\n  cross-section z=${cz}: x, ownerClass, baseline, resolved, written, world`);
  for (let x = cx - r; x <= cx + r; x++) {
    const i = idxOf(x, cz);
    console.log(`    x=${String(x).padStart(5)} ${ownerLetter(i)} base=${baseline.ground[i]} res=${resolved.ground[i]} wr=${written.ground[i]} world=${surfY[i] === -9999 ? "?" : surfY[i]}${surfName[i] ? " " + surfName[i] : ""}`);
  }
};
for (const c of clusters.slice(0, 2)) {
  const xs = c.members.map((m) => m.x), zs = c.members.map((m) => m.z);
  const cx = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), cz = Math.round(zs.reduce((a, b) => a + b, 0) / zs.length);
  asciiAround(cx, cz);
}
console.log(`\n=== end ${label} ===`);
