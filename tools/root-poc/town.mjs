/**
 * The town of the Troy demo — everything the settlement ASKS FOR and
 * everything it STANDS ON the ground, under `docs/COHERENT-SOURCE-v0.md`.
 *
 * Two exports, two moments in the pipeline:
 *
 * - {@link townSketch} runs BEFORE the field freezes. It returns pure data:
 *   building sites (which the core turns into micro-plateau constraints and
 *   catalog jobs) and the wall/dressing geometry. It never touches a block
 *   and never sees the field.
 * - {@link townStructures} runs AFTER the freeze. It returns structure
 *   blocks that STAND ON the ground it reads through `groundAt` (the plan's
 *   own oracle — Law I). It never moves earth, never writes below the
 *   surface it stands on, and the only surface it replaces is a paving swap
 *   at the surface's own level.
 *
 * A site: { x, z, facing (radians), size [sx,sy,sz] unrotated, archetype,
 * floors }. The core owns rejection (roads, water, overlap) and seating.
 */

const TAU = 2 * Math.PI;

/**
 * The settlement's asks, as pure data. `anchors` carries CITADEL, BENCH,
 * HARBOR, gate, plaza and WALL from the core config.
 */
export function townSketch(anchors) {
  const { CITADEL, BENCH, HARBOR, gate, plaza } = anchors;
  const sites = [];
  const E = 0, S = Math.PI / 2, W = Math.PI, Nn = -Math.PI / 2;

  /**
   * A site table row: [x, z, facing, sx, sy, sz, archetype, floors].
   * Positions are absolute, tuned against the ROUTED lanes (the A* roads are
   * a function of the terrain alone, so they are stable across builds and a
   * plan may be composed around them). The core still owns rejection.
   */
  const put = (x, z, facing, size, archetype, floors) =>
    sites.push({ x, z, facing, size, archetype, floors });

  /* --- the acropolis: the palace and its civic company ------------------- */
  // The palace: a megaron looking down the gate road.
  put(CITADEL.x - 2, CITADEL.z - 18, S, [17, 10, 12], "megaron", 1);
  // The council hall west of the plaza, the stoa on its south side.
  put(CITADEL.x - 26, CITADEL.z, E, [13, 10, 11], "hall", 2);
  put(CITADEL.x, CITADEL.z + 26, Nn, [15, 8, 8], "stoa", 1);
  put(CITADEL.x - 22, CITADEL.z - 20, E, [11, 8, 9], "bathhouse", 1);
  put(CITADEL.x + 28, CITADEL.z - 10, W, [11, 9, 9], "temple", 1);

  // The great houses of the citadel. Every citadel site keeps its footprint
  // clear of the curtain's own radius — a house that straddled the wall would
  // put two authors in one column.
  put(-40, -22, E, [9, 8, 8], "peristyle_house", 1);
  put(-8, -66, W, [9, 8, 8], "peristyle_house", 1);
  put(-8, -45, W, [9, 8, 8], "peristyle_house", 1);
  put(-31, -41, E, [9, 8, 8], "peristyle_house", 1);

  // The small houses out against the curtain, inside it.
  for (const [x, z] of [[-9, -13], [6, -30]]) {
    put(x, z, Math.atan2(CITADEL.z - z, CITADEL.x - x), [8, 7, 7], "cottage", 1);
  }

  /* --- the outer village: houses on the slopes beyond the curtain -------- */
  for (const [x, z] of [[-64, -76], [-40, -92], [22, -72], [-40, 4], [-72, -34]]) {
    put(x, z, Math.atan2(CITADEL.z - z, CITADEL.x - x), [9, 8, 8], "courtyard_house", 1);
  }

  /* --- the gate market: the stalls' neighbours, outside the wall --------- */
  put(gate.x + 14, gate.z - 4, Nn, [12, 9, 9], "inn", 2);
  put(gate.x + 22, gate.z + 10, W, [12, 8, 9], "marketplace", 1);
  put(gate.x + 17, gate.z - 20, W, [7, 12, 7], "watchtower", 3);
  put(40, -18, W, [10, 8, 8], "shop_row", 2);
  put(48, -2, W, [8, 7, 7], "cottage", 1);

  /* --- the descent: houses flanking the doubled lane down the hill ------- */
  // The harbour road and the bench lane share this corridor (x roughly -5..8),
  // so the ranks stand well back on either side of it.
  for (const [x, z] of [[-22, 17], [-16, 30], [-16, 42], [-14, 54], [-13, 65]]) {
    put(x, z, E, [9, 8, 7], "townhouse", 2);
  }
  for (const [x, z] of [[16, -1], [18, 14], [16, 32], [16, 43]]) {
    put(x, z, W, [9, 8, 7], "townhouse", 2);
  }
  put(-35, 26, E, [10, 7, 8], "olive_press", 1);
  put(32, 13, W, [10, 7, 8], "stable", 1);

  /* --- the lower town: ranks flanking the bench lane --------------------- */
  // North rank (the bench's own core, above the lane).
  for (const [x, z] of [[40, 33], [52, 33], [64, 39]]) put(x, z, S, [9, 7, 7], "cottage", 1);
  for (const [x, z] of [[44, 18], [55, 19], [66, 25]]) put(x, z, S, [9, 8, 7], "terraced_row", 2);
  // South rank, across the lane.
  for (const [x, z] of [[39, 53], [50, 58], [64, 60]]) put(x, z, Nn, [9, 7, 7], "cottage", 1);
  for (const [x, z] of [[78, 62], [92, 44], [94, 58]]) put(x, z, W, [9, 7, 7], "cottage", 1);

  // Lower-town trades.
  put(79, 31, W, [10, 8, 8], "smithy", 1);
  put(78, 50, W, [10, 10, 8], "granary", 2);
  put(69, 11, W, [12, 8, 10], "warehouse", 1);

  /* --- the harbor road and the harbor ------------------------------------ */
  put(108, 100, W, [10, 8, 8], "waystation", 1);
  put(122, 92, W, [11, 9, 9], "tavern", 2);
  put(96, 122, W, [9, 7, 8], "cottage", 1);
  put(HARBOR.x - 9, HARBOR.z + 6, E, [7, 6, 5], "hut", 1);
  put(HARBOR.x + 8, HARBOR.z + 6, E, [7, 6, 5], "hut", 1);
  put(HARBOR.x - 20, HARBOR.z - 9, E, [12, 8, 9], "boathouse", 1);
  put(HARBOR.x + 12, HARBOR.z - 12, W, [12, 8, 10], "warehouse", 1);
  put(HARBOR.x + 7, HARBOR.z - 29, W, [10, 8, 8], "trading_post", 1);
  put(HARBOR.x - 26, HARBOR.z + 4, E, [9, 7, 8], "salt_house", 1);
  put(HARBOR.x - 35, HARBOR.z - 9, E, [9, 7, 8], "cottage", 1);

  return { sites };
}

/**
 * Everything the town STANDS on the frozen ground: the grand wall with its
 * towers and gatehouse, the plaza and its well, lantern posts, market
 * stalls, the harbor quay and pier. Returns { blocks, wallRing } where
 * `wallRing` is the curtain's [x,z,baseY] cells for the verify harness.
 */
export function townStructures({ anchors, groundAt, st, stack, SEA, positionFloat, streamSeed, SEED, onRoad }) {
  const { CITADEL, BENCH, HARBOR, WALL, gate, plaza } = anchors;
  const wallRing = [];

  /* One writer, even inside this function: every block goes through `put`,
     keyed by column, so a tower and the curtain can never both claim a cell
     — the later, more specific writer simply owns it. */
  const cells = new Map();
  const put = (x, y, z, stateId) => { cells.set(x + "," + y + "," + z, { x, y, z, stateId }); };

  const CURTAIN = 7;          // the curtain's height above its footing
  const TOWER_RISE = 4;       // how far a tower stands above the curtain
  const TOWER_EVERY = 38;     // ring cells between towers
  const GATE_HEADROOM = 4;    // clear air the rampart leaves over the road

  const wallStates = [st("smooth_sandstone"), st("cut_sandstone")];
  const capState = st("smooth_sandstone_slab", { type: "top", waterlogged: "false" });
  const merlonState = st("chiseled_sandstone");
  const flagState = st("smooth_sandstone");
  const fenceState = st("oak_fence", { north: "false", south: "false", east: "false", west: "false", waterlogged: "false" });
  const lanternState = st("lantern", { hanging: "false", waterlogged: "false" });
  const hangingLantern = st("lantern", { hanging: "true", waterlogged: "false" });
  const cobbleState = st("cobblestone");

  /** True only on a lane's own centreline (the road mask eroded by its halo). */
  const onCentre = (x, z) => {
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (!onRoad(x + dx, z + dz)) return false;
    }
    return true;
  };

  const wallMix = (x, y, z) => wallStates[(x * 31 + z * 17 + y) % 64 < 52 ? 0 : 1];

  /* --- the ring, walked once as an ordered list of cells ----------------- */
  const rimCells = [];
  {
    const steps = Math.ceil(TAU * WALL.r * 2.2);
    const laid = new Set();
    for (let i = 0; i < steps; i++) {
      const a = (i * TAU) / steps;
      let da = Math.abs(a - ((((WALL.gateAngle % TAU) + TAU) % TAU)));
      if (da > Math.PI) da = TAU - da;
      const x = Math.round(CITADEL.x + WALL.r * Math.cos(a));
      const z = Math.round(CITADEL.z + WALL.r * Math.sin(a));
      const key = x + "," + z;
      if (laid.has(key)) continue;
      laid.add(key);
      // The gate is wherever the routed road actually crosses the ring — the
      // wall yields to the road the plan asked for (Law I: the road's columns
      // already have their author), plus the ceremonial arc.
      const gap = da < WALL.gateHalf || onRoad(x, z);
      rimCells.push({ x, z, a, base: groundAt(x, z), gap });
    }
  }

  /* --- the gap runs: the longest one gets a real gatehouse --------------- */
  const runs = [];
  {
    const n = rimCells.length;
    let i = 0;
    // Rotate to a non-gap start so runs never wrap the array seam.
    while (i < n && rimCells[i].gap) i++;
    const start0 = i % n;
    let run = null;
    for (let k = 0; k < n; k++) {
      const j = (start0 + k) % n;
      if (rimCells[j].gap) {
        if (run === null) run = { from: k, to: k };
        else run.to = k;
      } else if (run !== null) { runs.push(run); run = null; }
    }
    if (run !== null) runs.push(run);
    for (const r of runs) { r.len = r.to - r.from + 1; r.i0 = (start0 + r.from) % n; r.i1 = (start0 + r.to) % n; r.start0 = start0; }
    runs.sort((p, q) => q.len - p.len);
  }

  /* --- towers: footprints reserved BEFORE the curtain is laid ------------ */
  const towers = [];
  const reserve = (cx, cz, half, rise) => towers.push({ cx, cz, half, rise });
  const inTower = (x, z) => towers.some((t) => Math.abs(x - t.cx) <= t.half && Math.abs(z - t.cz) <= t.half);

  {
    const n = rimCells.length;
    // Gatehouse: two towers flanking the widest gap, set clear of the road.
    if (runs.length > 0) {
      const g = runs[0];
      for (const [idx0, dir] of [[g.from - 1, -1], [g.to + 1, 1]]) {
        // Step outward along the ring until a 5x5 block sits off the road.
        let placed = false;
        for (let step = 0; step < 10 && !placed; step++) {
          const j = ((g.start0 + idx0 + dir * step) % n + n) % n;
          const c = rimCells[j];
          if (c.gap) continue;
          let clean = true;
          for (let dz = -2; dz <= 2 && clean; dz++) for (let dx = -2; dx <= 2; dx++) {
            if (onRoad(c.x + dx, c.z + dz)) { clean = false; break; }
          }
          if (!clean) continue;
          reserve(c.x, c.z, 2, TOWER_RISE + 2);
          placed = true;
        }
      }
    }
    // Curtain towers, spaced around the rest of the ring.
    for (let i = 0; i < n; i += TOWER_EVERY) {
      const c = rimCells[i];
      if (c.gap) continue;
      let clean = true;
      for (let dz = -1; dz <= 1 && clean; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (onRoad(c.x + dx, c.z + dz) || inTower(c.x + dx, c.z + dz)) { clean = false; break; }
      }
      if (!clean) continue;
      reserve(c.x, c.z, 1, TOWER_RISE);
    }
  }

  /* --- the curtain: a ring on the rim the field already smoothed --------- */
  for (let i = 0; i < rimCells.length; i++) {
    const c = rimCells[i];
    if (c.gap) continue;
    if (inTower(c.x, c.z)) continue; // the tower is this cell's author
    wallRing.push([c.x, c.z, c.base]);
    for (let y = c.base + 1; y <= c.base + CURTAIN; y++) put(c.x, y, c.z, wallMix(c.x, y, c.z));
    // A merlon every third cell, a slab walkway between.
    put(c.x, c.base + CURTAIN + 1, c.z, i % 3 === 0 ? merlonState : capState);
  }

  /* --- the towers: solid to their own footing, capped and crenellated ---- */
  for (const t of towers) {
    let gmax = -Infinity;
    for (let dz = -t.half; dz <= t.half; dz++) for (let dx = -t.half; dx <= t.half; dx++) {
      gmax = Math.max(gmax, groundAt(t.cx + dx, t.cz + dz));
    }
    const top = gmax + CURTAIN + t.rise;
    for (let dz = -t.half; dz <= t.half; dz++) for (let dx = -t.half; dx <= t.half; dx++) {
      const x = t.cx + dx, z = t.cz + dz;
      const base = groundAt(x, z);
      for (let y = base + 1; y <= top; y++) put(x, y, z, wallMix(x, y, z));
      const edge = Math.abs(dx) === t.half || Math.abs(dz) === t.half;
      const corner = Math.abs(dx) === t.half && Math.abs(dz) === t.half;
      put(x, top + 1, z, edge ? (corner ? merlonState : capState) : capState);
      if (edge && !corner && (dx + dz) % 2 === 0) put(x, top + 2, z, merlonState);
    }
    // A lantern crowning each tower.
    put(t.cx, top + 2, t.cz, lanternState);
  }

  /* --- the gate: a paved threshold and the rampart that bridges it ------- */
  // The road owns its own columns at ground level, so the wall never touches
  // them; it steps OVER, four blocks of headroom up, and the rampart walk
  // runs unbroken from tower to tower. Two writers, two different blocks.
  for (const g of runs) {
    const n = rimCells.length;
    for (let k = g.from; k <= g.to; k++) {
      const c = rimCells[((g.start0 + k) % n + n) % n];
      // The threshold: a paving swap at the plan's own level.
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const x = c.x + dx, z = c.z + dz;
        if (inTower(x, z)) continue;
        const y = groundAt(x, z);
        if (y <= SEA) continue;
        put(x, y, z, ((x + z) & 1) === 0 ? flagState : st("cut_sandstone"));
      }
      // The span: the curtain's upper courses carried across the opening —
      // but never over a lane's own centreline, which stays open to the sky.
      // `onRoad` is the centreline dilated by three, so eroding it by three
      // recovers the centreline exactly; those columns the wall leaves alone.
      if (inTower(c.x, c.z)) continue;
      if (onCentre(c.x, c.z)) continue;
      for (let y = c.base + GATE_HEADROOM + 1; y <= c.base + CURTAIN; y++) {
        put(c.x, y, c.z, wallMix(c.x, y, c.z));
      }
      put(c.x, c.base + CURTAIN + 1, c.z, k % 3 === 0 ? merlonState : capState);
    }
  }

  /* --- the plaza: a paving swap at the plan's own level ------------------ */
  for (let dz = -plaza.r; dz <= plaza.r; dz++) for (let dx = -plaza.r; dx <= plaza.r; dx++) {
    if (Math.hypot(dx, dz) > plaza.r) continue;
    const x = plaza.x + dx, z = plaza.z + dz;
    const y = groundAt(x, z);
    const r = positionFloat(streamSeed(SEED, "plaza-mix"), x, 0, z);
    put(x, y, z, r < 0.75 ? flagState : st("sandstone"));
  }

  /* --- the well: cobble ring, one block of water, a slab roof ------------ */
  const well = { x: plaza.x - 4, z: plaza.z + 3 };
  {
    const cb = groundAt(well.x, well.z);
    // The kerb: eight columns, each rising from its OWN footing to the kerb.
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const x = well.x + dx, z = well.z + dz;
      for (let y = groundAt(x, z) + 1; y <= cb + 1; y++) put(x, y, z, cobbleState);
    }
    // The shaft: filled to the kerb's level, then one block of water, wholly
    // enclosed by the kerb it stands inside.
    for (let y = groundAt(well.x, well.z) + 1; y <= cb; y++) put(well.x, y, well.z, cobbleState);
    put(well.x, cb + 1, well.z, st("water", { level: "0" }));
    // Two posts and a roof.
    for (const [dx, dz] of [[-1, -1], [1, 1]]) {
      for (let y = cb + 2; y <= cb + 3; y++) put(well.x + dx, y, well.z + dz, fenceState);
    }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      put(well.x + dx, cb + 4, well.z + dz, capState);
    }
    put(well.x, cb + 3, well.z, hangingLantern); // hung from the roof slab above
  }

  /* --- lantern posts: the plaza rim and the bench lane ------------------- */
  const sketchCentres = townSketch(anchors).sites;
  const nearSite = (x, z, d) => sketchCentres.some((s) => Math.abs(s.x - x) < d && Math.abs(s.z - z) < d);
  let posts = 0;
  const post = (x, z, stream) => {
    if (onRoad(x, z)) return false;
    const y = groundAt(x, z);
    if (y <= SEA) return false;
    const h = 2 + (positionFloat(streamSeed(SEED, stream), x, y, z) < 0.4 ? 1 : 0);
    for (let k = 1; k <= h; k++) put(x, y + k, z, fenceState);
    put(x, y + h + 1, z, lanternState);
    posts++;
    return true;
  };
  {
    const R = plaza.r + 1;
    for (let i = 0; i < 10; i++) {
      const a = 0.15 + (i * TAU) / 10;
      const x = Math.round(plaza.x + R * Math.cos(a));
      const z = Math.round(plaza.z + R * Math.sin(a));
      if (Math.abs(x - well.x) <= 2 && Math.abs(z - well.z) <= 2) continue;
      post(x, z, "plaza-post");
    }
  }
  {
    // Along the bench lane, five blocks off the sketched centreline, skipping
    // anything the road mask or a building site already owns.
    const segs = [
      [{ x: gate.x + 9, z: gate.z + 14 }, { x: BENCH.x - 18, z: BENCH.z + 6 }],
      [{ x: BENCH.x - 18, z: BENCH.z + 6 }, { x: BENCH.x + 16, z: BENCH.z + 14 }],
    ];
    for (const [a, b] of segs) {
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      for (let t = 6; t < len; t += 9) {
        for (const s of [1, -1]) {
          const x = Math.round(a.x + ux * t - uz * 5 * s);
          const z = Math.round(a.z + uz * t + ux * 5 * s);
          if (nearSite(x, z, 7)) continue;
          post(x, z, "lane-post");
        }
      }
    }
  }

  /* --- market stalls outside the gate ------------------------------------ */
  let stalls = 0;
  {
    const ux = Math.cos(WALL.gateAngle), uz = Math.sin(WALL.gateAngle);
    const px = -uz, pz = ux;
    const wools = [st("white_wool"), st("red_wool"), st("orange_wool"), st("light_blue_wool")];
    // Candidate pitches on the apron outside the gate; the ones the road or a
    // building already owns are simply not taken.
    const spots = [];
    for (const along of [44, 50, 56, 62]) for (const side of [8, -8, 16, -16, 24, -24]) spots.push([along, side]);
    for (const [along, side] of spots) {
      if (stalls >= 6) break;
      const cx = Math.round(CITADEL.x + ux * along + px * side);
      const cz = Math.round(CITADEL.z + uz * along + pz * side);
      // A 4x3 open stall: corner posts, a wool canopy, a slab counter.
      let ok = true, gmax = -Infinity;
      for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -2; dx <= 1; dx++) {
        const x = cx + dx, z = cz + dz;
        if (onRoad(x, z) || nearSite(x, z, 7)) { ok = false; break; }
        const y = groundAt(x, z);
        if (y <= SEA) { ok = false; break; }
        gmax = Math.max(gmax, y);
      }
      if (!ok) continue;
      const roof = gmax + 3;
      const wool = wools[Math.floor(positionFloat(streamSeed(SEED, "stall-cloth"), cx, roof, cz) * wools.length) % wools.length];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -2; dx <= 1; dx++) {
        const x = cx + dx, z = cz + dz;
        const base = groundAt(x, z);
        const corner = (dx === -2 || dx === 1) && (dz === -1 || dz === 1);
        if (corner) for (let y = base + 1; y <= roof - 1; y++) put(x, y, z, fenceState);
        put(x, roof, z, wool);
        // The counter along the stall's back edge.
        if (dz === -1 && !corner) put(x, base + 1, z, st("oak_slab", { type: "top", waterlogged: "false" }));
      }
      put(cx, roof - 1, cz, hangingLantern); // hung from the canopy above
      stalls++;
    }
  }

  /* --- the harbor: quay paving + a pier standing in the water ------------ */
  {
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
      if (Math.hypot(dx, dz) > 8.5) continue;
      const x = HARBOR.x + dx, z = HARBOR.z + dz;
      const y = groundAt(x, z);
      if (y <= SEA) continue;
      put(x, y, z, flagState);
    }
    const pierDir = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
    for (let i = 0; i < 14; i++) {
      for (let s = -1; s <= 1; s++) {
        const x = Math.round(HARBOR.x + 6 + i * pierDir.x + s * pierDir.z * -1);
        const z = Math.round(HARBOR.z + 6 + i * pierDir.z + s * pierDir.x);
        put(x, SEA + 1, z, st("oak_planks"));
        if (i % 4 === 0 && s !== 0) {
          put(x, SEA, z, st("oak_log", { axis: "y" }));
          put(x, SEA - 1, z, st("oak_log", { axis: "y" }));
        }
      }
    }
    // Two lanterns on the pier head.
    put(Math.round(HARBOR.x + 6 + 13 * pierDir.x + pierDir.z), SEA + 2, Math.round(HARBOR.z + 6 + 13 * pierDir.z - pierDir.x), fenceState);
    put(Math.round(HARBOR.x + 6 + 13 * pierDir.x + pierDir.z), SEA + 3, Math.round(HARBOR.z + 6 + 13 * pierDir.z - pierDir.x), lanternState);
  }

  const blocks = [...cells.values()];
  blocks.towerCount = towers.length;
  blocks.postCount = posts;
  blocks.stallCount = stalls;
  return { blocks, wallRing, towers: towers.length, posts, stalls };
}
