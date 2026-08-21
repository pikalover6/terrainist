// Ground-coherence probe / harness.
//
// Two layers:
//
//   1. `buildProbeContext(doc, worldDir)` compiles a document in-process with
//      `groundEquivalence` on and reads a compiled world's walkable surface into
//      plain arrays. When `worldDir` is null the probe *self-emits*: it compiles
//      with emit into a temp directory and reads that back, so the harness needs
//      no pre-existing world on disk. When `worldDir` is given it must be the
//      compiler's own output (pre-client-upgrade): an installed save the client
//      has opened is migrated to a different region layout and reads as empty.
//   2. `censusFromContext(ctx)` is a *pure* function of that context and returns
//      one deterministic, JSON-serialisable report. It is pure on purpose: the
//      harness proves it can see a one-block difference by perturbing a copy of
//      the context's arrays and re-running the census.
//
// `computeGroundReport(doc, worldDir)` is the two composed.
//
// usage: node ground-probe.mjs <docPath> [worldDir|-] [label] [--json] [--out <file>]
import fs from "node:fs";
import path from "node:path";

const distUrl = new URL("../../packages/compiler/dist/index.js", import.meta.url);

/* -------------------------------------------------------------------------- */
/* class letters for the ASCII maps (text mode only)                          */
/* -------------------------------------------------------------------------- */
const CLS = {
  "fluid.channel": "C", "building.footprint": "B", "quarter.plane": "Q", "precinct.ground": "P",
  "structure.linework": "L", "plaza.ground": "Z", "plaza.well": "w",
  "courtyard.floor": "Y", "retaining.seam": "S", "retaining.skirt": "K",
  "street.network": "R", "street.sidewalk": "W", "road.network": "D",
  "sweep.run": "V", "doorstep.landing": "T", "farm.parcel": "F",
  "prop.pad": "O", "verge": "G",
};

const DECOR = new Set(["short_grass","tall_grass","grass","fern","large_fern","dandelion","poppy","azure_bluet","oxeye_daisy","cornflower","lily_of_the_valley","allium","blue_orchid","tulip","red_tulip","white_tulip","orange_tulip","pink_tulip","torch","lantern","wall_torch","snow","dead_bush","sweet_berry_bush","air","cave_air","vine","pink_petals","wildflowers","bush","firefly_bush","short_dry_grass","tall_dry_grass","leaf_litter","oak_leaves","birch_leaves","spruce_leaves","jungle_leaves","acacia_leaves","dark_oak_leaves","cherry_leaves","azalea_leaves","flowering_azalea_leaves","mangrove_leaves","pale_oak_leaves","oak_log","birch_log","spruce_log","jungle_log","acacia_log","dark_oak_log","cherry_log","pale_oak_log","mangrove_log","oak_sapling","banner","white_banner","red_banner","blue_banner","candle","flower_pot","potted_poppy","scaffolding","ladder","chain","iron_bars","oak_fence","spruce_fence","birch_fence","rail"]);
const WATERY = new Set(["water","lava","kelp","kelp_plant","seagrass","tall_seagrass","lily_pad","ice","packed_ice","blue_ice"]);

const NATURAL = "natural";

/* -------------------------------------------------------------------------- */
/* 1. context                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Compile `doc`, read a world surface back, and return the flat arrays the
 * census runs over. Nothing here depends on wall-clock or absolute paths.
 *
 * @param {unknown} doc parsed Loam document
 * @param {string|null} worldDir compiled world directory, or null to self-emit
 * @param {{ tmpRoot?: string }} [opts] where a self-emit run writes its world
 */
export async function buildProbeContext(doc, worldDir, opts = {}) {
  const { compileTerrain, listChunks, loadPrismarine, EMIT_MINECRAFT_VERSION } =
    await import(distUrl.href);

  let artifacts = null;
  let emitDir = null;
  let cleanup = null;
  if (worldDir === null || worldDir === undefined) {
    const root = opts.tmpRoot ?? fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "ground-probe-"));
    emitDir = path.join(root, "world");
    cleanup = opts.tmpRoot ? null : root;
  }

  const res = await compileTerrain(doc, {
    outDir: emitDir ?? "/dev/null-unused",
    skipEmit: emitDir === null,
    onArtifacts: (a) => { artifacts = a; },
    groundEquivalence: true,
    allowUnstable: true,
  });
  const ge = res.groundEquivalence;
  if (!ge) throw new Error("no groundEquivalence on compile result");
  const { baseline, intents, resolved, written } = ge;
  const finalPlan = artifacts.plan;
  const region = baseline.region;
  const W = region.width, H = region.depth;
  const idxOf = (x, z) => (z - region.z0) * W + (x - region.x0);
  const xOf = (i) => region.x0 + (i % W);
  const zOf = (i) => region.z0 + Math.floor(i / W);

  // owner class per column, interned
  const classNames = [];
  const classIdOf = new Map();
  const internClass = (c) => {
    let id = classIdOf.get(c);
    if (id === undefined) { id = classNames.length; classNames.push(c); classIdOf.set(c, id); }
    return id;
  };
  internClass(NATURAL); // id 0
  const ownerClassId = new Int32Array(resolved.owner.length);
  let ownedCount = 0;
  let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (let i = 0; i < resolved.owner.length; i++) {
    const o = resolved.owner[i];
    if (o < 0) { ownerClassId[i] = 0; continue; }
    ownerClassId[i] = internClass(intents[o].sourceClass);
    ownedCount++;
    const x = xOf(i), z = zOf(i);
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
    if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
  }
  bx0 = Math.max(bx0 - 8, region.x0); bz0 = Math.max(bz0 - 8, region.z0);
  bx1 = Math.min(bx1 + 8, region.x0 + W - 1); bz1 = Math.min(bz1 + 8, region.z0 + H - 1);

  // intent counts by class
  const intentsByClass = new Map();
  for (const it of intents) intentsByClass.set(it.sourceClass, (intentsByClass.get(it.sourceClass) ?? 0) + 1);

  // building footprint claims, materialised (intent column iterators are one-shot)
  const buildings = [];
  for (const it of intents) {
    if (it.sourceClass !== "building.footprint") continue;
    const idxs = [];
    const ys = [];
    try { for (const c of it.columns) { idxs.push(c.idx); ys.push(c.y); } } catch { /* exhausted */ }
    if (idxs.length === 0) continue;
    const sorted = [...ys].sort((a, b) => a - b);
    buildings.push({ source: it.source, idxs, floorY: sorted[Math.floor(sorted.length / 2)] });
  }

  // ---------------------------------------------------------------- surface
  const readDir = emitDir ?? path.resolve(worldDir);
  const regionDir = path.join(readDir, "region");
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

  // The anvil caches open file handles; close them before the directory goes,
  // or a later GC turns a dropped FileHandle into an uncatchable process error.
  await anvil.close();
  if (cleanup) fs.rmSync(cleanup, { recursive: true, force: true });

  return {
    region: { x0: region.x0, z0: region.z0, width: W, depth: H },
    bbox: { x0: bx0, x1: bx1, z0: bz0, z1: bz1 },
    ownedCount,
    intentCount: intents.length,
    intentsByClass,
    classNames,
    ownerClassId,
    buildings,
    baselineGround: Int32Array.from(baseline.ground),
    resolvedGround: Int32Array.from(resolved.ground),
    writtenGround: Int32Array.from(written.ground),
    ground: Int32Array.from(finalPlan.ground),
    fluidKind: Int32Array.from(finalPlan.fluidKind),
    surfY,
    surfName,
  };
}

/** Shallow-clone a context with copied height arrays, so a census can be re-run
 *  over a perturbed world without touching the original. */
export function cloneContext(ctx) {
  return {
    ...ctx,
    baselineGround: Int32Array.from(ctx.baselineGround),
    resolvedGround: Int32Array.from(ctx.resolvedGround),
    writtenGround: Int32Array.from(ctx.writtenGround),
    ground: Int32Array.from(ctx.ground),
    surfY: Int32Array.from(ctx.surfY),
  };
}

/* -------------------------------------------------------------------------- */
/* 2. the census — pure over the context                                       */
/* -------------------------------------------------------------------------- */

const histEntries = (h) =>
  [...h.entries()].sort((a, b) => a[0] - b[0]).map(([delta, n]) => ({ delta, n }));
const countEntries = (h) =>
  [...h.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1)).map(([name, n]) => ({ name, n }));
const round1 = (v) => Number(v.toFixed(1));

/**
 * @param {ReturnType<typeof buildProbeContext> extends Promise<infer T> ? T : never} ctx
 * @returns a deterministic, JSON-serialisable report
 */
export function censusFromContext(ctx) {
  const { region, bbox, classNames, ownerClassId, ground: gY, fluidKind, surfY } = ctx;
  const W = region.width, H = region.depth;
  const idxOf = (x, z) => (z - region.z0) * W + (x - region.x0);
  const xOf = (i) => region.x0 + (i % W);
  const zOf = (i) => region.z0 + Math.floor(i / W);
  const inB = (x, z) => x >= bbox.x0 && x <= bbox.x1 && z >= bbox.z0 && z <= bbox.z1;
  const ownerClass = (i) => classNames[ownerClassId[i]];
  const dry = (i) => fluidKind[i] === 0;
  const isBuilt = (i) => surfY[i] !== -9999 && surfY[i] > gY[i] + 1;

  // columns won by class
  const colsByClass = new Map();
  for (let i = 0; i < ownerClassId.length; i++) {
    if (ownerClassId[i] === 0) continue;
    const c = classNames[ownerClassId[i]];
    colsByClass.set(c, (colsByClass.get(c) ?? 0) + 1);
  }

  // sanity: world surface vs final plan ground, dry columns in bbox
  const sanity = new Map();
  let sanN = 0;
  for (let z = Math.max(bbox.z0, region.z0); z <= Math.min(bbox.z1, region.z0 + H - 1); z++) {
    for (let x = Math.max(bbox.x0, region.x0); x <= Math.min(bbox.x1, region.x0 + W - 1); x++) {
      const i = idxOf(x, z);
      if (surfY[i] === -9999) continue;
      if (fluidKind[i] !== 0) continue;
      const d = surfY[i] - gY[i];
      sanity.set(d, (sanity.get(d) ?? 0) + 1); sanN++;
    }
  }

  // stage deltas
  const stageHist = (a, b) => {
    const h = new Map();
    for (let i = 0; i < a.length; i++) { const d = b[i] - a[i]; if (d !== 0) h.set(d, (h.get(d) ?? 0) + 1); }
    return h;
  };
  const wr = stageHist(ctx.resolvedGround, ctx.writtenGround);
  let wrTotal = 0; for (const c of wr.values()) wrTotal += c;
  const wrByOwner = new Map();
  for (let i = 0; i < ctx.writtenGround.length; i++) {
    if (ctx.writtenGround[i] === ctx.resolvedGround[i]) continue;
    const c = ownerClass(i);
    wrByOwner.set(c, (wrByOwner.get(c) ?? 0) + 1);
  }
  const fw = stageHist(ctx.writtenGround, gY);
  let fwTotal = 0; for (const c of fw.values()) fwTotal += c;

  // GROUND cliff census
  const cliffEdges = [];
  const pairHist = new Map();
  for (let z = bbox.z0; z <= bbox.z1; z++) {
    for (let x = bbox.x0; x <= bbox.x1; x++) {
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
        if (ownerClass(hi) !== NATURAL || ownerClass(lo) !== NATURAL)
          cliffEdges.push({ x, z, d, hi, lo });
      }
    }
  }

  // building seat audit
  const buildings = [];
  for (const b of ctx.buildings) {
    const set = new Set(b.idxs);
    const ring = [];
    for (const idx of b.idxs) {
      const x = xOf(idx), z = zOf(idx);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!inB(x + dx, z + dz)) continue;
        const j = idxOf(x + dx, z + dz);
        if (set.has(j)) continue;
        if (!dry(j) || isBuilt(j)) continue;
        ring.push(gY[j]);
      }
    }
    if (ring.length === 0) continue;
    ring.sort((a, b2) => a - b2);
    const ringMed = ring[Math.floor(ring.length / 2)];
    const ringMax = ring[ring.length - 1];
    buildings.push({
      source: b.source, floorY: b.floorY, ringMed, ringMax,
      sink: ringMed - b.floorY, worst: ringMax - b.floorY, n: b.idxs.length,
    });
  }
  const sinkHist = new Map();
  for (const b of buildings) sinkHist.set(b.sink, (sinkHist.get(b.sink) ?? 0) + 1);
  const worstSeats = [...buildings]
    .sort((a, b) => (b.sink - a.sink) || (b.worst - a.worst) || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0))
    .slice(0, 12);

  // street flank
  const flank = new Map();
  for (let z = bbox.z0; z <= bbox.z1; z++) {
    for (let x = bbox.x0; x <= bbox.x1; x++) {
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
  const flankRows = [...flank.entries()].map(([name, m]) => {
    let n = 0; for (const v of m.values()) n += v;
    return { name, n, byDelta: histEntries(m) };
  }).sort((a, b) => (b.n - a.n) || (a.name < b.name ? -1 : 1));

  // clusters
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
  const clusterRow = (c) => {
    const xs = c.members.map((m) => m.x), zs = c.members.map((m) => m.z);
    const cx = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    const cz = Math.round(zs.reduce((a, b) => a + b, 0) / zs.length);
    const kinds = new Map();
    for (const m of c.members) {
      const k = `${ownerClass(m.hi)}/${ownerClass(m.lo)}`;
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    return {
      score: c.score, edges: c.members.length, cx, cz,
      topKinds: countEntries(kinds).slice(0, 3),
    };
  };
  const clusterRows = clusters.map(clusterRow)
    .sort((a, b) => (b.score - a.score) || (b.edges - a.edges) || (a.cx - b.cx) || (a.cz - b.cz));

  return {
    region: { x0: region.x0, z0: region.z0, width: W, depth: H },
    bbox: { x0: bbox.x0, x1: bbox.x1, z0: bbox.z0, z1: bbox.z1 },
    ownedColumns: ctx.ownedCount,
    intents: { total: ctx.intentCount, byClass: countEntries(ctx.intentsByClass) },
    columnsWonByClass: countEntries(colsByClass),
    sanity: { n: sanN, byDelta: histEntries(sanity) },
    writtenVsResolved: { total: wrTotal, byDelta: histEntries(wr), byOwner: countEntries(wrByOwner) },
    finalPlanVsWritten: { total: fwTotal, byDelta: histEntries(fw) },
    cliffCensus: [...pairHist.entries()]
      .map(([pair, e]) => ({ pair, n: e.n, avg: round1(e.sum / e.n), max: e.maxDrop }))
      .sort((a, b) => (b.n - a.n) || (a.pair < b.pair ? -1 : 1)),
    buildingSeats: {
      count: buildings.length,
      sinkHist: histEntries(sinkHist),
      worst: worstSeats,
    },
    streetFlank: flankRows,
    clusters: { count: clusters.length, top: clusterRows.slice(0, 6) },
  };
}

/** Compile + read + census, in one call. */
export async function computeGroundReport(doc, worldDir, opts = {}) {
  const ctx = await buildProbeContext(doc, worldDir, opts);
  return censusFromContext(ctx);
}

/* -------------------------------------------------------------------------- */
/* 3. text rendering (the original CLI output, unchanged in shape)             */
/* -------------------------------------------------------------------------- */

function renderText(ctx, rep, label) {
  const { region, bbox, classNames, ownerClassId, ground: gY, surfY, surfName } = ctx;
  const W = region.width;
  const idxOf = (x, z) => (z - region.z0) * W + (x - region.x0);
  const ownerClass = (i) => classNames[ownerClassId[i]];
  const ownerLetter = (i) => (ownerClassId[i] === 0 ? "." : (CLS[classNames[ownerClassId[i]]] ?? "?"));
  const fmtDelta = (d) => `${d > 0 ? "+" + d : d}`;
  const byCount = (rows) => rows.map((r) => `${fmtDelta(r.delta)}:${r.n}`);

  console.log(`=== ${label} ===`);
  console.log(`region x[${region.x0},${region.x0 + W - 1}] z[${region.z0},${region.z0 + region.depth - 1}]  owned columns: ${rep.ownedColumns}  bbox x[${bbox.x0},${bbox.x1}] z[${bbox.z0},${bbox.z1}]`);
  console.log(`intents: ${rep.intents.total}`);
  console.log("  " + rep.intents.byClass.map((r) => `${r.name}:${r.n}`).join("  "));
  console.log("columns won, by class: " + rep.columnsWonByClass.map((r) => `${r.name}:${r.n}`).join("  "));

  console.log(`\n-- sanity: worldSurface − finalPlan.ground (dry cols, n=${rep.sanity.n}; >0 = structure standing on ground) --`);
  console.log("  " + [...rep.sanity.byDelta].sort((a, b) => b.n - a.n).slice(0, 12).map((r) => `${r.delta >= 0 ? "+" + r.delta : r.delta}:${r.n}`).join("  "));

  console.log(`\n-- written(after structures) vs resolved(contract answer): nonzero cols by delta --`);
  console.log(`  total ${rep.writtenVsResolved.total}: ${byCount([...rep.writtenVsResolved.byDelta].sort((a, b) => b.n - a.n).slice(0, 14)).join("  ") || "(none)"}`);
  console.log("  by owner: " + (rep.writtenVsResolved.byOwner.map((r) => `${r.name}:${r.n}`).join("  ") || "(none)"));
  console.log(`\n-- finalPlan vs written: ground moved AFTER the structure pass (programs/scatter) --`);
  console.log(`  total ${rep.finalPlanVsWritten.total}: ${byCount([...rep.finalPlanVsWritten.byDelta].sort((a, b) => b.n - a.n).slice(0, 14)).join("  ") || "(none)"}`);

  console.log(`\n-- GROUND cliff census: adjacent dry |Δ finalPlan.ground|>=2, built cols excluded (higher-class over lower-class) --`);
  for (const r of rep.cliffCensus.slice(0, 20))
    console.log(`  ${String(r.n).padStart(6)}  avg ${r.avg.toFixed(1)}  max ${String(r.max).padStart(2)}   ${r.pair}`);

  console.log(`\n-- building seat audit: building floor vs surrounding world surface --`);
  console.log(`  ${rep.buildingSeats.count} buildings; ringMedian − floorY histogram (positive = building BELOW surrounding ground):`);
  console.log("  " + rep.buildingSeats.sinkHist.map((r) => `${fmtDelta(r.delta)}:${r.n}`).join("  "));
  console.log(`  worst 12 by ring-median sink:`);
  for (const b of rep.buildingSeats.worst)
    console.log(`    sink +${b.sink} (worst edge +${b.worst})  floorY ${b.floorY}  ${b.source}  (${b.n} cols)`);

  console.log(`\n-- street flank: neighbourSurf − streetSurf for street.network cols vs non-street neighbours --`);
  for (const r of rep.streetFlank)
    console.log(`  ${r.name.padEnd(20)} n=${String(r.n).padStart(6)}  ${r.byDelta.map((d) => `${fmtDelta(d.delta)}:${d.n}`).join(" ")}`);

  console.log(`\n-- ${rep.clusters.count} cliff clusters; top 6 by total drop --`);
  for (const c of rep.clusters.top)
    console.log(`  score ${c.score}  edges ${c.edges}  center (${c.cx},${c.cz})  ${c.topKinds.map((k) => `${k.name}:${k.n}`).join(" ")}`);

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
    console.log(`\n  cross-section z=${cz}: x, ownerClass, baseline, resolved, written, world`);
    for (let x = cx - r; x <= cx + r; x++) {
      const i = idxOf(x, cz);
      console.log(`    x=${String(x).padStart(5)} ${ownerLetter(i)} base=${ctx.baselineGround[i]} res=${ctx.resolvedGround[i]} wr=${ctx.writtenGround[i]} world=${surfY[i] === -9999 ? "?" : surfY[i]}${surfName[i] ? " " + surfName[i] : ""}`);
      void ownerClass;
    }
  };
  for (const c of rep.clusters.top.slice(0, 2)) asciiAround(c.cx, c.cz);
  console.log(`\n=== end ${label} ===`);
}

/* -------------------------------------------------------------------------- */
/* 4. CLI                                                                      */
/* -------------------------------------------------------------------------- */

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const positional = [];
  let json = false;
  let outFile = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") json = true;
    else if (argv[i] === "--out") outFile = argv[++i];
    else positional.push(argv[i]);
  }
  const [docPath, worldArg, labelArg] = positional;
  if (!docPath) {
    console.error("usage: node ground-probe.mjs <docPath> [worldDir|-] [label] [--json] [--out <file>]");
    process.exit(2);
  }
  const doc = JSON.parse(fs.readFileSync(docPath, "utf8"));
  const worldDir = !worldArg || worldArg === "-" ? null : worldArg;
  const ctx = await buildProbeContext(doc, worldDir);
  const rep = censusFromContext(ctx);
  const text = JSON.stringify(rep, null, 2);
  if (outFile) fs.writeFileSync(outFile, text + "\n");
  if (json) console.log(text);
  if (!json && !outFile) renderText(ctx, rep, labelArg ?? path.basename(docPath));
}
