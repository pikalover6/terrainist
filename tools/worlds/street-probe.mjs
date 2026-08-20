import path from "node:path";
import { listChunks, loadPrismarine, EMIT_MINECRAFT_VERSION } from "@terrainist/compiler";

const worldDir = process.argv[2];
const bbox = process.argv[3] ? process.argv[3].split(",").map(Number) : null; // x0,z0,x1,z1
const regionDir = path.join(path.resolve(worldDir), "region");
const chunks = await listChunks(regionDir);
const mc = loadPrismarine(EMIT_MINECRAFT_VERSION);
const anvil = mc.openAnvil(regionDir);
const nameCache = new Map();
const resolve = (id) => {
  let c = nameCache.get(id);
  if (c === undefined) { const n = mc.blockNameByStateId(id); c = (n ?? "").replace("minecraft:", ""); nameCache.set(id, c); }
  return c;
};

// decor to skip when finding the walking surface
const DECOR = new Set(["short_grass","tall_grass","grass","fern","large_fern","dandelion","poppy","azure_bluet","oxeye_daisy","cornflower","lily_of_the_valley","allium","blue_orchid","tulip","red_tulip","white_tulip","orange_tulip","pink_tulip","torch","lantern","wall_torch","snow","dead_bush","sweet_berry_bush","air","cave_air","vine","pink_petals","wildflowers","bush","firefly_bush","short_dry_grass","tall_dry_grass","leaf_litter"]);

// unicorn street palette (white_quartz) + generic street materials
const ROAD = new Set(["calcite","smooth_quartz","quartz_block","smooth_stone"]);
const KERB = new Set(["polished_diorite","diorite","quartz_bricks"]);
const NATURAL = new Set(["grass_block","dirt","coarse_dirt","podzol","sand","gravel","stone","dirt_path","moss_block","mud","rooted_dirt","clay","sandstone","mycelium"]);

const surf = new Map(); // key x|z -> {y, name}
for (const { chunkX, chunkZ } of chunks) {
  const chunk = await anvil.load(chunkX, chunkZ);
  if (chunk === null) continue;
  for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
    const x = chunkX * 16 + lx, z = chunkZ * 16 + lz;
    if (bbox && (x < bbox[0] || z < bbox[1] || x > bbox[2] || z > bbox[3])) continue;
    const top = chunk.highestBlock(lx, lz);
    if (top === null) continue;
    let y = top.y;
    let name = resolve(chunk.getBlockStateId(lx, y, lz));
    while (DECOR.has(name) && y > -60) { y--; name = resolve(chunk.getBlockStateId(lx, y, lz)); }
    surf.set(`${x}|${z}`, { y, name });
  }
}

// pass 1: locate road columns; report material census over the bbox
const census = new Map();
const roads = [];
for (const [k, v] of surf) {
  census.set(v.name, (census.get(v.name) ?? 0) + 1);
  if (ROAD.has(v.name)) { const [x, z] = k.split("|").map(Number); roads.push({ x, z, y: v.y, name: v.name }); }
}
console.log("— surface census (top 25) —");
[...census.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([n, c]) => console.log(String(c).padStart(7), n));
console.log("road columns:", roads.length);

// pass 2: road-edge deltas against non-road neighbours
const hist = new Map(); // delta -> count, split by neighbour class
const plusOne = [];
for (const r of roads) {
  for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const n = surf.get(`${r.x+dx}|${r.z+dz}`);
    if (!n || ROAD.has(n.name)) continue;
    const cls = KERB.has(n.name) ? "kerb" : NATURAL.has(n.name) ? "natural" : "built";
    const d = n.y - r.y;
    const key = `${cls}:${d}`;
    hist.set(key, (hist.get(key) ?? 0) + 1);
    if (cls === "natural" && d >= 1) plusOne.push({ x: r.x, z: r.z, d, n: n.name });
  }
}
console.log("\n— road-edge deltas (neighbour_surface − road_surface) —");
[...hist.entries()].sort().forEach(([k, c]) => console.log(String(c).padStart(7), k));

// cluster the +1 natural edges and print the 4 biggest clusters
const seen = new Set();
const clusters = [];
const byKey = new Map(plusOne.map(p => [`${p.x}|${p.z}`, p]));
for (const p of plusOne) {
  const k0 = `${p.x}|${p.z}`;
  if (seen.has(k0)) continue;
  const stack = [k0]; const members = [];
  while (stack.length) {
    const k = stack.pop();
    if (seen.has(k) || !byKey.has(k)) continue;
    seen.add(k); members.push(byKey.get(k));
    const [x, z] = k.split("|").map(Number);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) stack.push(`${x+dx}|${z+dz}`);
  }
  clusters.push(members);
}
clusters.sort((a, b) => b.length - a.length);
const matCensus = new Map();
for (const p of plusOne) matCensus.set(p.n, (matCensus.get(p.n) ?? 0) + 1);
console.log("\n— +1 neighbour materials —");
[...matCensus.entries()].sort((a,b)=>b[1]-a[1]).forEach(([n,c])=>console.log(String(c).padStart(6), n));
console.log("\n— sunken-edge clusters (natural neighbour ≥ +1 above road) —");
clusters.slice(0, 6).forEach((c, i) => {
  const xs = c.map(m => m.x), zs = c.map(m => m.z);
  console.log(`#${i} n=${c.length} bbox x ${Math.min(...xs)}..${Math.max(...xs)} z ${Math.min(...zs)}..${Math.max(...zs)} maxDelta ${Math.max(...c.map(m => m.d))}`);
});

// cross-sections at the 3 biggest clusters: slice perpendicular through the centre
const sym = (name) => ROAD.has(name) ? "R" : KERB.has(name) ? "K" : NATURAL.has(name) ? "." : "#";
for (const c of clusters.slice(0, 3)) {
  const mid = c[Math.floor(c.length / 2)];
  for (const axis of ["x", "z"]) {
    console.log(`\n— cross-section through (${mid.x}, ${mid.z}) along ${axis} —`);
    const line = [];
    for (let o = -8; o <= 8; o++) {
      const x = axis === "x" ? mid.x + o : mid.x;
      const z = axis === "z" ? mid.z + o : mid.z;
      const s = surf.get(`${x}|${z}`);
      line.push(s ? { o, y: s.y, name: s.name } : null);
    }
    const ys = line.filter(Boolean).map(l => l.y);
    const top = Math.max(...ys), bot = Math.min(...ys);
    for (let y = top; y >= bot; y--) {
      let row = String(y).padStart(4) + " ";
      for (const l of line) row += l === null ? " " : l.y >= y ? sym(l.name) : " ";
      console.log(row);
    }
    console.log("     " + line.map(l => l === null ? "?" : sym(l.name)).join(""));
    console.log("     " + line.map(l => l && l.o === 0 ? "^" : " ").join(""));
    console.log("mats: " + line.map(l => l ? `${l.o}:${l.name}@${l.y}` : "").filter(Boolean).join(" "));
  }
}
