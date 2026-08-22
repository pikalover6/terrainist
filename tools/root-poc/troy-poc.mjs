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
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { townSketch, townStructures } from "./town.mjs";
import { environsSketch, environsStructures } from "./environs.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const compiler = await import(path.join(ROOT, "packages/compiler/dist/index.js"));
const { invokeLandmark } = await import(path.join(ROOT, "packages/compiler/dist/programs/invoke.js"));
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

/** The war camp of the besiegers, soft-flattened on the plain south-west. */
const CAMP = { x: -70, z: 128, r: 34, band: 24, y: 67, weight: 0.85 };
/** The horse stands on its own firm pad at the camp's city-facing edge. */
const HORSE_PAD = { x: -34, z: 96, r: 11, band: 9, y: 68 };
/** Olive grove terraces on the seaward flank between bench and harbor. */
const GROVES = [
  { x: 96, z: 74, r: 19, band: 14, y: 70, weight: 0.6 },
  { x: 118, z: 92, r: 16, band: 12, y: 67, weight: 0.6 },
  { x: 82, z: 100, r: 15, band: 12, y: 68, weight: 0.6 },
];
/** The necropolis knoll on the approach — raised, not levelled. */
const KNOLL = { x: -128, z: 24, r: 15, band: 12 };

blendPlateau(field1, CAMP);
blendPlateau(field1, HORSE_PAD);
for (const g of GROVES) blendPlateau(field1, g);
blendPlateau(field1, { ...KNOLL, y: field1[idx(KNOLL.x, KNOLL.z)] + 4, weight: 0.7 });

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

// The environs: the war road out to the camp (branching from the harbor
// road just outside the gate, so the breach carries no fourth lane), the
// tombs spur lining the approach, and the grove lane off the bench.
const roadWar = route(field1, 20, 10, CAMP.x + 12, CAMP.z - 10);
const roadTombs = route(field1, -20, 55, KNOLL.x + 8, KNOLL.z + 2);
const roadGrove = route(field1, 78, 60, GROVES[0].x, GROVES[0].z);

const roads = [roadHarborGate, roadGatePlaza, benchIn, benchOut, roadWar, roadTombs, roadGrove];

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
 * The settlement's asks come from the town module (`town.mjs`) as pure data:
 * catalog archetypes with positions and facings. The core turns each kept
 * site into a micro-plateau constraint before the field freezes, so every
 * seat is calm ground with natural falloff — no retaining, no aprons, no
 * pads. Rejection (roads, water, overlap) stays HERE: it is the law's, not
 * the town's.
 */
const anchors = { CITADEL, BENCH, HARBOR, WALL, gate, plaza, CAMP, HORSE_PAD, GROVES, KNOLL };
const { sites: TOWN_SITES } = townSketch(anchors);
const { sites: ENVIRON_SITES } = environsSketch(anchors);
const SITES = [...TOWN_SITES, ...ENVIRON_SITES];

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
  // Reject a site the roads already claimed, the sea owns, or — the bug Kai
  // walked straight into — another building already stands on. Two blocks of
  // daylight between footprints, always.
  let blocked = false;
  for (const p of placedSites) {
    if (x0 - 2 <= p.x0 + p.sx + 1 && x0 + sx + 1 >= p.x0 - 2 && z0 - 2 <= p.z0 + p.sz + 1 && z0 + sz + 1 >= p.z0 - 2) {
      blocked = true;
      break;
    }
  }
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
  // The emitted terrain's OWN ground level — read from the plan, never
  // re-derived from the field. Kai's first walk found paths standing one
  // block proud of the grass: my `Math.round(field)` and the plan's rounding
  // disagreed on some columns, and a surface block placed one above the real
  // surface is a lip. One writer, one answer, and the answer is the plan's.
  return plan.ground[idx(x, z)];
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

/** Everything the town stands on the frozen ground — from the town module. */
const townPass = townStructures({
  anchors, groundAt, st, stack, SEA, positionFloat, streamSeed, SEED,
  onRoad: (x, z) => x >= REGION.x0 && z >= REGION.z0 && x < REGION.x0 + width && z < REGION.z0 + depth && roadMask[idx(x, z)] === 1,
});
const wallBlocks = townPass.blocks;
const environPass = environsStructures({
  anchors, groundAt, st, stack, SEA, positionFloat, streamSeed, SEED,
  onRoad: (x, z) => x >= REGION.x0 && z >= REGION.z0 && x < REGION.x0 + width && z < REGION.z0 + depth && roadMask[idx(x, z)] === 1,
});

/**
 * THE HORSE — the doc's own authored landmark program, run against the
 * frozen ground. The program is data (battery is read-only); its voxels
 * stamp onto the pad the field already firmed. Air voxels carve the hollow
 * belly but may never carve the ground (Law II: nothing repairs, nothing
 * digs). The name→state parse handles `oak_log[axis=z]` forms.
 */
const horseBlocks = [];
{
  const horseDoc = JSON.parse(readFileSync(path.join(ROOT, "battery/candidates/troy_r22/trojan_horse_troy.loam.json"), "utf8"));
  const run = invokeLandmark({
    programId: "trojan_horse",
    program: horseDoc.programs.trojan_horse,
    nodePath: "poc.horse",
    worldSeed: WORLD_SEED,
    heightAt: () => 0,
  });
  if (run.ok) {
    const stateCache = new Map();
    const stateOf = (name) => {
      let sid = stateCache.get(name);
      if (sid === undefined) {
        const m = /^([a-z_:0-9]+)(?:\[(.*)\])?$/.exec(name);
        const props = {};
        if (m[2]) for (const kv of m[2].split(",")) { const [k, v] = kv.split("="); props[k] = v; }
        sid = st(m[1], m[2] ? props : undefined);
        stateCache.set(name, sid);
      }
      return sid;
    };
    let minLy = Infinity;
    for (const k of run.voxels.keys()) minLy = Math.min(minLy, Number(k.split(",")[1]));
    const [ex, , ez] = horseDoc.programs.trojan_horse.envelope;
    const origin = { x: HORSE_PAD.x - (ex >> 1), z: HORSE_PAD.z - (ez >> 1) };
    const baseY = groundAt(HORSE_PAD.x, HORSE_PAD.z) + 1 - minLy;
    for (const [k, name] of run.voxels) {
      const [lx, ly, lz] = k.split(",").map(Number);
      const wx = origin.x + lx, wy = baseY + ly, wz = origin.z + lz;
      if (name === "minecraft:air" && wy <= groundAt(wx, wz)) continue;
      horseBlocks.push({ x: wx, y: wy, z: wz, stateId: stateOf(name.replace("minecraft:", "")) });
    }
  } else {
    console.log("  horse: program refused; plain stays empty", run.diagnostics.slice(0, 2));
  }
}

/** Road surfaces: drape the final ground exactly; stairs where it steps once. */
const roadBlocks = [];
{
  const pathState = st("dirt_path");
  const gravelState = st("gravel");
  // Every surface here REPLACES the plan's own top block at the plan's own
  // level — the road never adds a block above the ground, so it can never
  // stand proud of it. A column where the road rises exactly one block gets
  // its surface block swapped for a stair (a half-step up from the lower
  // side); everything else gets the path mix at grade.
  const laid = new Set();
  const stairFixups = [];
  for (const { road } of profiles) {
    for (let i = 0; i < road.length; i++) {
      const cx = xOf(road[i]), cz = zOf(road[i]);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > 1) continue;
        const x = cx + dx, z = cz + dz;
        if (x < REGION.x0 || z < REGION.z0 || x >= REGION.x0 + width || z >= REGION.z0 + depth) continue;
        const key = x + "," + z;
        if (laid.has(key)) continue;
        laid.add(key);
        const y = groundAt(x, z);
        if (y <= SEA) continue;
        const r = positionFloat(streamSeed(SEED, "road-mix"), x, 0, z);
        roadBlocks.push({ x, y, z, stateId: r < 0.82 ? pathState : gravelState });
      }
      // A one-block rise between consecutive centerline columns: the HIGHER
      // column's surface (and its lane neighbours at the same level) becomes
      // a stair facing the ascent. Collected now and appended after the path
      // pass — later blocks stamp over earlier ones, so the stair wins the
      // higher column's surface slot whichever direction the lane was laid.
      if (i === 0) continue;
      const px = xOf(road[i - 1]), pz = zOf(road[i - 1]);
      const dxT = Math.sign(cx - px), dzT = Math.sign(cz - pz);
      if ((dxT !== 0) === (dzT !== 0)) continue;
      const py = groundAt(px, pz), cy = groundAt(cx, cz);
      if (Math.abs(cy - py) !== 1) continue;
      const up = cy > py;
      const hx = up ? cx : px, hz = up ? cz : pz, hy = up ? cy : py;
      const facing = up
        ? (dxT === 1 ? "east" : dxT === -1 ? "west" : dzT === 1 ? "south" : "north")
        : (dxT === 1 ? "west" : dxT === -1 ? "east" : dzT === 1 ? "north" : "south");
      const s = stack.blockStateOf("sandstone_stairs", { facing, half: "bottom", shape: "straight", waterlogged: "false" });
      const sid = typeof s === "object" ? s.stateId : s;
      for (let t = -1; t <= 1; t++) {
        const x = hx + (dxT === 0 ? t : 0), z = hz + (dzT === 0 ? t : 0);
        if (x < REGION.x0 || z < REGION.z0 || x >= REGION.x0 + width || z >= REGION.z0 + depth) continue;
        if (groundAt(x, z) === hy) stairFixups.push({ x, y: hy, z, stateId: sid });
      }
    }
  }
  roadBlocks.push(...stairFixups);
}

/* -------------------------------------------------------------------------- */
/* stage 8 — the clearing and the trees, through the real scatter              */
/* -------------------------------------------------------------------------- */

/** Settlement clearing: 0 inside the town's ground, feathering to 1 outside. */
const clearing = new Float32Array(N).fill(1);
{
  const soften = (cx, cz, r, feather, floor = 0) => {
    const R = r + feather;
    for (let z = Math.max(REGION.z0, Math.floor(cz - R)); z <= Math.min(REGION.z0 + depth - 1, Math.ceil(cz + R)); z++) {
      for (let x = Math.max(REGION.x0, Math.floor(cx - R)); x <= Math.min(REGION.x0 + width - 1, Math.ceil(cx + R)); x++) {
        const d = Math.hypot(x - cx, z - cz);
        if (d >= R) continue;
        const w = Math.max(floor, d <= r ? 0 : smoothstep((d - r) / feather));
        const k = idx(x, z);
        if (w < clearing[k]) clearing[k] = w;
      }
    }
  };
  soften(CITADEL.x, CITADEL.z, WALL.r + 6, 18);
  soften(BENCH.x, BENCH.z, BENCH.r + 10, 16);
  soften(HARBOR.x, HARBOR.z, HARBOR.r + 4, 12);
  soften(CAMP.x, CAMP.z, CAMP.r + 8, 14);
  soften(HORSE_PAD.x, HORSE_PAD.z, HORSE_PAD.r + 6, 10);
  soften(KNOLL.x, KNOLL.z, KNOLL.r + 6, 10);
  // Ambient wilderness thins inside the groves; the orchard nodes own them.
  for (const g of GROVES) soften(g.x, g.z, g.r + 4, 10, 0.2);
  for (const { road } of profiles) for (const k of road) soften(xOf(k), zOf(k), 4, 7);
}

// The grove terraces get ORCHARD nodes — tight olive rows on their own
// discs (area.at is fractional over the region; radius is blocks).
const frac = (x, z) => [(x - REGION.x0) / width, (z - REGION.z0) / depth];
const groveNodes = GROVES.map((g, i) => ({
  id: `poc.grove.${i}`,
  nodePath: `poc.grove.${i}`,
  seed: streamSeed(SEED, `grove.${i}`),
  params: {
    density: 0.5,
    spacing: 5,
    clumping: 0,
    maxSlope: 30,
    area: { at: frac(g.x, g.z), radius: g.r },
    species: [{ id: "olive", shape: "oak_spreading", weight: 1 }],
  },
}));

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
  }, ...groveNodes],
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
  ...environPass.blocks,
  ...buildingPass.blocks,
  ...horseBlocks,
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

// The build manifest — what the verify harness holds this world against.
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify({
    region: REGION,
    sea: SEA,
    anchors,
    routes: roads.map((road) => road.map((k) => [xOf(k), zOf(k)])),
    sites: placedSites.map((s) => ({ archetype: s.archetype, x0: s.x0, z0: s.z0, sx: s.sx, sz: s.sz, y: s.y })),
    wallRing: townPass.wallRing,
  }),
);

console.log(`troy_rootpoc emitted -> ${worldDir}`);
console.log(`  chunks ${summary.chunkCount ?? "?"}, buildings ${buildingPass.built.length}/${jobs.length} (of ${SITES.length} sites), trees ${scatter.trees.length}`);
console.log(`  placed: ${placedSites.map((s) => s.archetype).join(", ")}`);
console.log(`  wall ${wallBlocks.length} blocks, roads ${roadBlocks.length} blocks`);
for (const d of buildingPass.diagnostics) console.log(`  diag ${d.code ?? ""} ${d.message ?? JSON.stringify(d).slice(0, 140)}`);
