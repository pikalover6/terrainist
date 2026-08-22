/**
 * THE ROOT-FIX POC — Troy with the fight dissolved instead of solved.
 *
 * The diagnosis (2026-08-22, ratified as a POC): our generator plays plan
 * against terrain per block and re-establishes smoothness one law at a time —
 * elections, descent solvers, seam stacks. The generators that never produce
 * mangled ground make three moves instead, and this file is those three moves
 * and nothing else:
 *
 *   1. **Terrain absorbs the plan.** The settlement's needs — a citadel
 *      plateau, a lower-town bench, a harbor pad, every road — are LANDFORM
 *      CONSTRAINTS blended into the heightfield through smooth kernels before
 *      any block exists. The edit primitive can only emit terrain-shaped
 *      output, so a jagged seam is not fixed here; it is unrepresentable.
 *   2. **Routing is terrain-aware.** Roads are A* on a slope-cost field over
 *      the landform terrain. They hug contours; switchbacks EMERGE on steep
 *      ground. There is no stair solver because there is nothing to solve.
 *   3. **Structures drape.** Buildings seat on micro-plateaus blended in with
 *      the same kernel (no retaining, no aprons); the wall ring follows the
 *      plateau rim, which is smooth by construction; road surfaces follow the
 *      final ground exactly, one stair block wherever the ground steps once.
 *
 * NO generator rules are imported: no election, no descent, no ground
 * contract, no street datum, no ranks. Reused as neutral plumbing only:
 * stdlib noise/classify/seeds, the terrain column/palette/scatter/emit stack,
 * and the structure catalog's own building grammar.
 *
 * Deterministic from SEED. Usage:
 *   node tools/root-poc/troy-poc.mjs --out <dir>
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const compiler = await import(path.join(ROOT, "packages/compiler/dist/index.js"));
const buildings = await import(path.join(ROOT, "packages/compiler/dist/structures/buildings.js"));
const stdlib = await import(path.join(ROOT, "packages/stdlib/dist/index.js"));

const {
  loadPrismarine,
  EMIT_MINECRAFT_VERSION,
  buildColumnPlan,
  resolvePalette,
  scatterForests,
  emitTerrain,
} = compiler;
const { decorate } = await import(path.join(ROOT, "packages/compiler/dist/terrain/decorate.js"));
const { buildBuildings } = buildings;
const { HeightField, classify, gradientNoise2, nodeSeed, streamSeed, positionFloat } = stdlib;

/* -------------------------------------------------------------------------- */
/* configuration — every number the world hangs off                            */
/* -------------------------------------------------------------------------- */

const WORLD_SEED = 0x7209n; // "TROY"
const SEED = nodeSeed(WORLD_SEED, "poc.troy");
const REGION = { x0: -256, z0: -256, width: 512, depth: 512 };
const SEA = 62;
const PLAIN = 68;

/** The hill Troy stands on. */
const HILL = { x: -20, z: -40, r: 175, height: 33 };
/** The citadel plateau — the first landform the plan asks for. */
const CITADEL = { x: -20, z: -40, r: 36, band: 26, y: 88 };
/** The lower-town bench on the seaward flank. */
const BENCH = { x: 52, z: 36, r: 30, band: 22, y: 73, weight: 0.9 };
/** The harbor pad at the shore. */
const HARBOR = { x: 148, z: 128, r: 14, band: 12, y: SEA + 1 };
/** Where the coast runs: sea occupies the far south-east. */
const COAST = { c: 210, band: 90, seabed: 54 };
/** The wall ring around the citadel. */
const WALL = { r: 40, height: 5, gateAngle: Math.atan2(BENCH.z - CITADEL.z, BENCH.x - CITADEL.x), gateHalf: 0.055 };
/** Roads never exceed this grade after absorption. */
const MAX_GRADE = 0.34;
const ROAD_RIBBON = 6;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

/* -------------------------------------------------------------------------- */
/* stage 1 — the base landform                                                 */
/* -------------------------------------------------------------------------- */

const { width, depth } = REGION;
const N = width * depth;
const idx = (x, z) => (z - REGION.z0) * width + (x - REGION.x0);
const xOf = (k) => REGION.x0 + (k % width);
const zOf = (k) => REGION.z0 + Math.floor(k / width);

const noiseSeed = streamSeed(SEED, "landform");
const noiseAt = (x, z) => {
  // Three octaves of gradient noise, low frequency — rolling ground.
  let a = 0;
  a += gradientNoise2(noiseSeed, x / 96, z / 96) * 6.5;
  a += gradientNoise2(noiseSeed, x / 37 + 100, z / 37) * 2.6;
  a += gradientNoise2(noiseSeed, x / 13, z / 13 + 100) * 0.9;
  return a;
};

function baseHeight(x, z) {
  let h = PLAIN + noiseAt(x, z);
  // The hill mass.
  const dh = Math.hypot(x - HILL.x, z - HILL.z);
  h += HILL.height * smoothstep(1 - dh / HILL.r);
  // The coast: a diagonal shelf into the sea, south-east.
  const d = (x + z) / Math.SQRT2 - COAST.c + 18 * gradientNoise2(noiseSeed, x / 70 + 300, z / 70);
  if (d > 0) h = h + (COAST.seabed - h) * smoothstep(d / COAST.band);
  return h;
}

const field0 = new Float64Array(N);
for (let k = 0; k < N; k++) field0[k] = baseHeight(xOf(k), zOf(k));

/* -------------------------------------------------------------------------- */
/* stage 2 — landform constraints: the plan speaks INTO the terrain            */
/* -------------------------------------------------------------------------- */

/** Blend a plateau into the field: inside r fully at target, feathered over band. */
function blendPlateau(field, { x, z, r, band, y, weight = 1 }) {
  const R = r + band;
  for (let zz = Math.max(REGION.z0, Math.floor(z - R)); zz <= Math.min(REGION.z0 + depth - 1, Math.ceil(z + R)); zz++) {
    for (let xx = Math.max(REGION.x0, Math.floor(x - R)); xx <= Math.min(REGION.x0 + width - 1, Math.ceil(x + R)); xx++) {
      const d = Math.hypot(xx - x, zz - z);
      if (d >= R) continue;
      const w = weight * smoothstep((R - d) / band);
      const k = idx(xx, zz);
      field[k] = field[k] + w * (y - field[k]);
    }
  }
}

const field1 = Float64Array.from(field0);
blendPlateau(field1, CITADEL);
blendPlateau(field1, BENCH);
blendPlateau(field1, HARBOR);

/* -------------------------------------------------------------------------- */
/* stage 3 — terrain-aware routing (A* on a slope-cost field)                  */
/* -------------------------------------------------------------------------- */

const STEPS8 = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** A* from a to b over `field`; cost punishes slope quadratically and water absolutely. */
function route(field, ax, az, bx, bz) {
  const start = idx(ax, az);
  const goal = idx(bx, bz);
  const g = new Float64Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  g[start] = 0;
  // Binary heap of [f, node].
  const heap = [[0, start]];
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length > 0) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const hx = (k) => Math.hypot(xOf(k) - bx, zOf(k) - bz);
  while (heap.length > 0) {
    const [, u] = pop();
    if (u === goal) break;
    const ux = xOf(u), uz = zOf(u);
    for (const [dx, dz, len] of STEPS8) {
      const vx = ux + dx, vz = uz + dz;
      if (vx <= REGION.x0 || vz <= REGION.z0 || vx >= REGION.x0 + width - 1 || vz >= REGION.z0 + depth - 1) continue;
      const v = idx(vx, vz);
      const slope = Math.abs(field[v] - field[u]) / len;
      const wet = field[v] < SEA + 0.6 ? 1000 : 0;
      const c = g[u] + len * (1 + 55 * slope * slope) + wet;
      if (c < g[v]) { g[v] = c; from[v] = u; push([c + hx(v), v]); }
    }
  }
  const out = [];
  for (let k = goal; k >= 0; k = from[k]) out.push(k);
  out.reverse();
  return out;
}

/** Sketch endpoints: gate on the wall ring toward the bench; plaza at the summit. */
const gate = {
  x: Math.round(CITADEL.x + (WALL.r + 2) * Math.cos(WALL.gateAngle)),
  z: Math.round(CITADEL.z + (WALL.r + 2) * Math.sin(WALL.gateAngle)),
};
const plaza = { x: CITADEL.x, z: CITADEL.z, r: 9 };

const roadHarborGate = route(field1, HARBOR.x, HARBOR.z, gate.x, gate.z);
const roadGatePlaza = route(field1, gate.x, gate.z, plaza.x, plaza.z);
// The bench lane: through the lower town, rejoining the main road.
const benchIn = route(field1, gate.x, gate.z, BENCH.x - 18, BENCH.z + 6);
const benchOut = route(field1, BENCH.x - 18, BENCH.z + 6, BENCH.x + 16, BENCH.z + 14);

const roads = [roadHarborGate, roadGatePlaza, benchIn, benchOut];

/* -------------------------------------------------------------------------- */
/* stage 4 — absorb the roads: each route becomes a landform ribbon            */
/* -------------------------------------------------------------------------- */

/**
 * Relax a route's elevation profile until no step exceeds MAX_GRADE, by
 * repeated forward/backward clamping against the endpoints. The result is the
 * smooth monotone-ish profile a road engineer would peg out — and because it
 * is blended back into the terrain, the hillside BECOMES the grade.
 */
function relaxProfile(field, road) {
  const y = road.map((k) => field[k]);
  const lens = [];
  for (let i = 1; i < road.length; i++) {
    lens.push(Math.hypot(xOf(road[i]) - xOf(road[i - 1]), zOf(road[i]) - zOf(road[i - 1])));
  }
  for (let pass = 0; pass < 64; pass++) {
    let moved = false;
    for (let i = 1; i < y.length; i++) {
      const lim = MAX_GRADE * lens[i - 1];
      if (y[i] > y[i - 1] + lim) { y[i] = y[i - 1] + lim; moved = true; }
      if (y[i] < y[i - 1] - lim) { y[i] = y[i - 1] - lim; moved = true; }
    }
    for (let i = y.length - 2; i >= 0; i--) {
      const lim = MAX_GRADE * lens[i];
      if (y[i] > y[i + 1] + lim) { y[i] = y[i + 1] + lim; moved = true; }
      if (y[i] < y[i + 1] - lim) { y[i] = y[i + 1] - lim; moved = true; }
    }
    if (!moved) break;
  }
  // A gentle smoothing pass so the profile is a curve, not a chain of clamps.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i + 1 < y.length; i++) y[i] = (y[i - 1] + 2 * y[i] + y[i + 1]) / 4;
  }
  return y;
}

/** Blend every road ribbon into the field as a weighted target average. */
function absorbRoads(field, roadsWithProfiles) {
  const wSum = new Float64Array(N);
  const tSum = new Float64Array(N);
  for (const { road, profile } of roadsWithProfiles) {
    for (let i = 0; i < road.length; i++) {
      const cx = xOf(road[i]), cz = zOf(road[i]);
      for (let dz = -ROAD_RIBBON; dz <= ROAD_RIBBON; dz++) {
        for (let dx = -ROAD_RIBBON; dx <= ROAD_RIBBON; dx++) {
          const d = Math.hypot(dx, dz);
          if (d > ROAD_RIBBON) continue;
          const x = cx + dx, z = cz + dz;
          if (x < REGION.x0 || z < REGION.z0 || x >= REGION.x0 + width || z >= REGION.z0 + depth) continue;
          const w = smoothstep(1 - d / ROAD_RIBBON);
          const k = idx(x, z);
          wSum[k] += w;
          tSum[k] += w * profile[i];
        }
      }
    }
  }
  for (let k = 0; k < N; k++) {
    if (wSum[k] <= 0) continue;
    const target = tSum[k] / wSum[k];
    const w = Math.min(1, wSum[k]);
    field[k] = field[k] + w * (target - field[k]);
  }
}

const profiles = roads.map((road) => ({ road, profile: relaxProfile(field1, road) }));
absorbRoads(field1, profiles);

/* -------------------------------------------------------------------------- */
/* stage 5 — building sites on the calm ground, each a micro-landform          */
/* -------------------------------------------------------------------------- */

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const st = (name, props) => {
  const s = props === undefined ? stack.blockByName(name)?.stateId : stack.blockStateOf(name, props);
  if (s === undefined) throw new Error(`unknown block ${name}`);
  return typeof s === "object" ? s.stateId : s;
};

/**
 * The settlement sketch's buildings: catalog archetypes, hand-laid the way the
 * doc's intent lays them — a megaron palace on the plaza, houses ringing it,
 * a lower town along the bench lane, an inn by the gate, sheds at the harbor.
 * Positions are polar around their center; the terrain BENEATH each is blended
 * to its own level before the final field freezes, so every seat is calm
 * ground with natural falloff — no retaining, no aprons, no pads.
 */
const SITES = [];
function ringSites(center, r, count, startAngle, size, archetype, floors) {
  for (let i = 0; i < count; i++) {
    const a = startAngle + (i * 2 * Math.PI) / count;
    SITES.push({
      x: Math.round(center.x + r * Math.cos(a)),
      z: Math.round(center.z + r * Math.sin(a)),
      facing: a + Math.PI, // face the center
      size,
      archetype,
      floors,
    });
  }
}
// The palace: a megaron looking down the gate road.
SITES.push({ x: CITADEL.x - 2, z: CITADEL.z - 18, facing: Math.PI / 2, size: [17, 10, 12], archetype: "megaron", floors: 1 });
// Citadel houses: two rings between the plaza and the wall.
ringSites(plaza, 17, 5, 0.55, [10, 8, 8], "peristyle_house", 1);
ringSites(plaza, 28, 7, 0.15, [10, 9, 8], "townhouse", 2);
// The lower town: two rings along the bench lane.
ringSites(BENCH, 14, 6, 0.2, [9, 7, 7], "cottage", 1);
ringSites({ x: BENCH.x + 4, z: BENCH.z + 2 }, 25, 5, 0.9, [9, 8, 7], "townhouse", 2);
// The inn outside the gate; sheds at the harbor.
SITES.push({ x: gate.x + 8, z: gate.z + 10, facing: -Math.PI / 2, size: [12, 9, 9], archetype: "inn", floors: 2 });
SITES.push({ x: HARBOR.x - 6, z: HARBOR.z - 8, facing: 0, size: [7, 6, 5], archetype: "hut", floors: 1 });
SITES.push({ x: HARBOR.x + 6, z: HARBOR.z - 2, facing: 0, size: [7, 6, 5], archetype: "hut", floors: 1 });

/** Keep sites off roads and out of the water; snap each to its ground. */
const roadMask = new Uint8Array(N);
for (const { road } of profiles) {
  for (const k of road) {
    const cx = xOf(k), cz = zOf(k);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x >= REGION.x0 && z >= REGION.z0 && x < REGION.x0 + width && z < REGION.z0 + depth) roadMask[idx(x, z)] = 1;
    }
  }
}

const placedSites = [];
for (const site of SITES) {
  const yaw = ((Math.round(-site.facing / (Math.PI / 2)) % 4) + 4) % 4 * 90;
  const rotated = yaw === 90 || yaw === 270;
  const sx = rotated ? site.size[2] : site.size[0];
  const sz = rotated ? site.size[0] : site.size[2];
  const x0 = Math.round(site.x - sx / 2), z0 = Math.round(site.z - sz / 2);
  // Reject a site the roads already claimed or the sea owns.
  let blocked = false;
  let acc = 0, n = 0;
  for (let z = z0 - 1; z <= z0 + sz && !blocked; z++) for (let x = x0 - 1; x <= x0 + sx; x++) {
    if (x < REGION.x0 + 4 || z < REGION.z0 + 4 || x >= REGION.x0 + width - 4 || z >= REGION.z0 + depth - 4) { blocked = true; break; }
    const k = idx(x, z);
    if (roadMask[k] === 1 || field1[k] < SEA + 0.8) { blocked = true; break; }
    acc += field1[k]; n += 1;
  }
  if (blocked) continue;
  const y = Math.round(acc / n);
  placedSites.push({ ...site, yaw, x0, z0, sx, sz, y });
  // The micro-landform: the seat blends to its level with a 5-block feather.
  blendPlateau(field1, { x: site.x, z: site.z, r: Math.max(sx, sz) / 2 + 1.5, band: 5.5, y });
}

/* -------------------------------------------------------------------------- */
/* stage 6 — the field freezes; the neutral terrain stack takes over           */
/* -------------------------------------------------------------------------- */

const field = new HeightField(REGION, field1);
const classification = classify(field, {
  seaLevel: SEA,
  cliffThreshold: 52,
  beachWidth: 5,
  snowLineFraction: 0.99,
});
const paletteRes = resolvePalette(stack, undefined, SEED);
const plan = buildColumnPlan({
  field,
  classification,
  palette: paletteRes.palette,
  seaLevel: SEA,
  soilDepth: 3,
  calderas: [],
  basins: [],
  seed: SEED,
});

// `buildColumnPlan` leaves the biome array for the compile's own biome pass,
// which this POC does not run — fill it here or every column tints as id 0.
{
  const plains = stack.biomeIdByName("minecraft:plains");
  const ocean = stack.biomeIdByName("minecraft:ocean");
  const beach = stack.biomeIdByName("minecraft:beach");
  for (let k = 0; k < N; k++) {
    const cls = classification.classes[k];
    plan.biome[k] = classification.oceanMask[k] === 1 ? ocean : cls === 1 ? beach : plains;
  }
}

/* -------------------------------------------------------------------------- */
/* stage 7 — structures: catalog buildings, the wall ring, road surfaces       */
/* -------------------------------------------------------------------------- */

const groundAt = (x, z) => {
  // The plan's final ground level for a column: the field, rounded, is the
  // terrain contract here — one writer, one answer.
  return Math.round(field1[idx(x, z)]);
};

const jobs = placedSites.map((s, i) => ({
  nodePath: `poc.building.${i}`,
  placement: {
    nodePath: `poc.building.${i}`,
    id: `${s.archetype}.${i}`,
    translation: [s.x0, s.y, s.z0],
    yaw: s.yaw,
    mirror: false,
    size: [s.sx, s.size[1], s.sz],
    footprint: { x0: s.x0, z0: s.z0, x1: s.x0 + s.sx - 1, z1: s.z0 + s.sz - 1 },
    anchor: { x: Math.round(s.x0 + s.sx / 2), z: Math.round(s.z0 + s.sz / 2) },
    foundationY: s.y,
  },
  size: s.size,
  params: { archetype: s.archetype, floors: s.floors },
  ports: { door: { type: "door", face: "south", at: "center" } },
  seed: streamSeed(SEED, `building.${i}`),
  tags: [],
}));

const buildingPass = buildBuildings(jobs, plan, stack);

/** The wall: a ring on the citadel rim. The rim is smooth, so the wall is level work. */
const wallBlocks = [];
{
  const wallStates = [st("smooth_sandstone"), st("cut_sandstone")];
  const capState = st("smooth_sandstone_slab");
  const steps = Math.ceil(2 * Math.PI * WALL.r * 2.2);
  const laid = new Set();
  for (let i = 0; i < steps; i++) {
    const a = (i * 2 * Math.PI) / steps;
    // The gate: an opening where the road leaves, flanked by towers below.
    let da = Math.abs(a - ((WALL.gateAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    if (da > Math.PI) da = 2 * Math.PI - da;
    const x = Math.round(CITADEL.x + WALL.r * Math.cos(a));
    const z = Math.round(CITADEL.z + WALL.r * Math.sin(a));
    const key = x + "," + z;
    if (laid.has(key)) continue;
    laid.add(key);
    const base = groundAt(x, z);
    if (da < WALL.gateHalf) continue;
    const tower = da < WALL.gateHalf * 2.6;
    const h = WALL.height + (tower ? 3 : 0);
    for (let y = base + 1; y <= base + h; y++) {
      wallBlocks.push({ x, y, z, stateId: wallStates[(x * 31 + z * 17 + y) % 64 < 52 ? 0 : 1] });
    }
    // Crenellation: merlon two of three, on the ring's own rhythm.
    if (tower || i % 3 !== 0) wallBlocks.push({ x, y: base + h + 1, z, stateId: capState });
  }
}

/** Road surfaces: drape the final ground exactly; stairs where it steps once. */
const roadBlocks = [];
{
  const pathState = st("dirt_path");
  const flagState = st("smooth_sandstone");
  const gravelState = st("gravel");
  const laid = new Set();
  for (const { road } of profiles) {
    for (let i = 0; i < road.length; i++) {
      const cx = xOf(road[i]), cz = zOf(road[i]);
      // Direction of travel, for stair facing.
      const nk = road[Math.min(i + 1, road.length - 1)];
      const dxT = Math.sign(xOf(nk) - cx), dzT = Math.sign(zOf(nk) - cz);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > 1) continue;
        const x = cx + dx, z = cz + dz;
        if (x < REGION.x0 || z < REGION.z0 || x >= REGION.x0 + width || z >= REGION.z0 + depth) continue;
        const key = x + "," + z;
        if (laid.has(key)) continue;
        laid.add(key);
        const y = groundAt(x, z);
        if (y <= SEA) continue;
        const ahead = groundAt(clamp(x + dxT, REGION.x0, REGION.x0 + width - 1), clamp(z + dzT, REGION.z0, REGION.z0 + depth - 1));
        if (ahead === y + 1 && (dxT !== 0) !== (dzT !== 0)) {
          const facing = dxT === 1 ? "east" : dxT === -1 ? "west" : dzT === 1 ? "south" : "north";
          const s = stack.blockStateOf("sandstone_stairs", { facing, half: "bottom", shape: "straight", waterlogged: "false" });
          roadBlocks.push({ x, y: y + 1, z, stateId: typeof s === "object" ? s.stateId : s });
        } else {
          const r = positionFloat(streamSeed(SEED, "road-mix"), x, 0, z);
          roadBlocks.push({ x, y, z, stateId: r < 0.82 ? pathState : gravelState });
        }
      }
    }
  }
  // The plaza: a sandstone circle at the summit.
  for (let dz = -plaza.r; dz <= plaza.r; dz++) for (let dx = -plaza.r; dx <= plaza.r; dx++) {
    if (Math.hypot(dx, dz) > plaza.r) continue;
    const x = plaza.x + dx, z = plaza.z + dz;
    const y = groundAt(x, z);
    const r = positionFloat(streamSeed(SEED, "plaza-mix"), x, 0, z);
    roadBlocks.push({ x, y, z, stateId: r < 0.75 ? flagState : st("sandstone") });
  }
  // The harbor quay: a stone apron on the pad, and a short pier into the water.
  for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
    if (Math.hypot(dx, dz) > 8.5) continue;
    const x = HARBOR.x + dx, z = HARBOR.z + dz;
    const y = groundAt(x, z);
    if (y <= SEA) continue;
    roadBlocks.push({ x, y, z, stateId: st("smooth_sandstone") });
  }
  const pierDir = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
  for (let i = 0; i < 14; i++) {
    for (let s = -1; s <= 1; s++) {
      const x = Math.round(HARBOR.x + 6 + i * pierDir.x + s * pierDir.z * -1);
      const z = Math.round(HARBOR.z + 6 + i * pierDir.z + s * pierDir.x);
      roadBlocks.push({ x, y: SEA + 1, z, stateId: st("oak_planks") });
      if (i % 4 === 0 && s !== 0) {
        roadBlocks.push({ x, y: SEA, z, stateId: st("oak_log", { axis: "y" }) });
        roadBlocks.push({ x, y: SEA - 1, z, stateId: st("oak_log", { axis: "y" }) });
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* stage 8 — the clearing and the trees, through the real scatter              */
/* -------------------------------------------------------------------------- */

/** Settlement clearing: 0 inside the town's ground, feathering to 1 outside. */
const clearing = new Float32Array(N).fill(1);
{
  const soften = (cx, cz, r, feather) => {
    const R = r + feather;
    for (let z = Math.max(REGION.z0, Math.floor(cz - R)); z <= Math.min(REGION.z0 + depth - 1, Math.ceil(cz + R)); z++) {
      for (let x = Math.max(REGION.x0, Math.floor(cx - R)); x <= Math.min(REGION.x0 + width - 1, Math.ceil(cx + R)); x++) {
        const d = Math.hypot(x - cx, z - cz);
        if (d >= R) continue;
        const w = d <= r ? 0 : smoothstep((d - r) / feather);
        const k = idx(x, z);
        if (w < clearing[k]) clearing[k] = w;
      }
    }
  };
  soften(CITADEL.x, CITADEL.z, WALL.r + 6, 18);
  soften(BENCH.x, BENCH.z, BENCH.r + 10, 16);
  soften(HARBOR.x, HARBOR.z, HARBOR.r + 4, 12);
  for (const { road } of profiles) for (const k of road) soften(xOf(k), zOf(k), 4, 7);
}

const scatter = scatterForests(
  [{
    id: "poc.forest",
    nodePath: "poc.forest",
    seed: streamSeed(SEED, "forest"),
    params: {
      density: 0.02,
      spacing: 7,
      clumping: 0.45,
      maxSlope: 38,
      species: [
        { id: "olive", shape: "oak_spreading", weight: 6 },
        { id: "cypress", shape: "larch_columnar", weight: 2 },
      ],
    },
  }],
  plan,
  classification,
  paletteRes.palette,
  undefined,
  clearing,
);

/* -------------------------------------------------------------------------- */
/* stage 9 — emit                                                              */
/* -------------------------------------------------------------------------- */

const outArg = process.argv.indexOf("--out");
const outDir = outArg >= 0 ? process.argv[outArg + 1] : path.join(ROOT, "out", "troy_rootpoc");
const worldDir = path.join(outDir, "troy_rootpoc");

const structures = [
  ...roadBlocks,
  ...wallBlocks,
  ...buildingPass.blocks,
];

/** Ground cover through the real decoration pass: grass, flowers, shore reeds. */
const decoration = decorate({
  plan,
  classification,
  temperature: new Float32Array(N).fill(0.62),
  trees: scatter.trees,
  forests: scatter.nodes,
  palette: paletteRes.palette,
  stack,
  seed: SEED,
});

const spawnY = groundAt(plaza.x, plaza.z) + 1;
const summary = await emitTerrain({
  plan,
  trees: scatter.trees,
  decor: decoration.blocks,
  structures,
  stack,
  worldDir,
  levelName: "troy_rootpoc",
  spawn: { x: plaza.x, y: spawnY + 1, z: plaza.z },
});

console.log(`troy_rootpoc emitted -> ${worldDir}`);
console.log(`  chunks ${summary.chunkCount ?? "?"}, buildings ${buildingPass.built.length}/${jobs.length}, trees ${scatter.trees.length}`);
console.log(`  wall ${wallBlocks.length} blocks, roads ${roadBlocks.length} blocks`);
for (const d of buildingPass.diagnostics) console.log(`  diag ${d.code ?? ""} ${d.message ?? JSON.stringify(d).slice(0, 140)}`);
