/**
 * The six naturalistic shape programs (FLORA-GRAMMAR-v0 §3.6–§3.12, WP-B).
 *
 * `broadleaf`, `giant`, `ancient`, `columnar`, `umbrella`, `weeping`. Each one
 * satisfies the six laws of §3.3 at every corner of its envelope, and the laws
 * are what the constructions in here are *for*:
 *
 * - **Law 1** (no *live* wood is the top of its column — suspended as a
 *   universal law by §9.4, kept at the source by {@link capWood}) is why every
 *   program ends with a cap mass or a plate over its own leader.
 * - **Law 2** (leaf BFS ≤ 6 from wood, zero unreachable) is why `mass` is
 *   always centred on a wood block and why its radius is bounded. The
 *   ellipsoid test is monotone in `|dx|`, `|dy|`, `|dz|`, so a staircase path
 *   from the centre to any leaf stays inside the mass: the BFS distance of a
 *   leaf is exactly its taxicab distance from the centre, and bounding the
 *   radius bounds the BFS.
 * - **Law 3** (branches connected) is why every limb is rasterised by
 *   {@link walkLimb}, one lattice axis per block, from a block that is already
 *   wood.
 * - **Law 4** (roots seat) is why the giant's flare only ever writes `dy ≤ 0`
 *   and fills every column it opens back up to grade.
 * - **Law 6** (canopy connectivity) is why the root flare grows outward only
 *   from columns it has already accepted, and why nothing is ever emitted at a
 *   position the plant has not connected.
 */

import {
  knob,
  type FloraBlock,
  type FloraProgram,
  type FloraSpeciesDef,
  type FloraVariation,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/* Construction helpers                                                        */
/* -------------------------------------------------------------------------- */

/** A plant under construction: the block list plus a position index. */
interface Build {
  readonly out: FloraBlock[];
  /** Position → index into {@link Build.out}. */
  readonly at: Map<string, number>;
}

function build(): Build {
  return { out: [], at: new Map() };
}

function key(dx: number, dy: number, dz: number): string {
  return `${dx},${dy},${dz}`;
}

/**
 * Emit one block, unless the plant already occupies that position.
 *
 * Unlike the legacy transcriptions (whose duplicates are load-bearing — see
 * §3.3), the new programs are de-duplicated: they overlap masses freely, and a
 * duplicate would skew `clipTrees`' `hit / blocks.length` against them.
 */
function put(b: Build, block: FloraBlock): void {
  const k = key(block.dx, block.dy, block.dz);
  if (b.at.has(k)) return;
  b.at.set(k, b.out.length);
  b.out.push(block);
}

/**
 * Emit a wood block, **overwriting** whatever the plant already had there.
 *
 * Wood wins over canopy, and it has to: a limb rasterised through a mass an
 * earlier limb grew would otherwise be silently dropped, and the next block of
 * the walk would have nothing to attach to — a floating limb, law 3 broken, for
 * no reason a reader of the geometry could see.
 */
function putWood(b: Build, block: FloraBlock): void {
  const k = key(block.dx, block.dy, block.dz);
  const seen = b.at.get(k);
  if (seen === undefined) {
    b.at.set(k, b.out.length);
    b.out.push(block);
    return;
  }
  const existing = b.out[seen] as FloraBlock;
  if (existing.part === "log" || existing.part === "branch") return;
  b.out[seen] = block;
}

/** The block the plant currently holds at a position, if any. */
function blockAt(b: Build, dx: number, dy: number, dz: number): FloraBlock | undefined {
  const i = b.at.get(key(dx, dy, dz));
  return i === undefined ? undefined : (b.out[i] as FloraBlock);
}

function has(b: Build, dx: number, dy: number, dz: number): boolean {
  return b.at.has(key(dx, dy, dz));
}

/** A vertical run of trunk logs, `dy` in `[y0, y1]`. */
function column(b: Build, dx: number, dz: number, y0: number, y1: number): void {
  for (let dy = y0; dy <= y1; dy++) put(b, { dx, dy, dz, part: "log" });
}

/** A point of the plant. */
interface P3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Rasterise a limb from a wood block outward, **one lattice axis per block**.
 *
 * A 3-D Bresenham without the diagonal step: at each block the axis with the
 * largest remaining error is the one that moves, so consecutive limb blocks are
 * always 6-adjacent (law 3) and the `axis` the emitter writes is the axis the
 * walk just stepped.
 *
 * Returns the tip — which is wood, and is therefore a legal centre for a mass.
 */
function walkLimb(
  b: Build,
  from: P3,
  dirX: number,
  dirZ: number,
  run: number,
  rise: number,
  dead = false,
): P3 {
  const tx = Math.round(dirX * run);
  const tz = Math.round(dirZ * run);
  const ty = rise;
  let x = from.x;
  let y = from.y;
  let z = from.z;
  let rx = tx;
  let ry = ty;
  let rz = tz;
  let guard = Math.abs(tx) + Math.abs(ty) + Math.abs(tz);
  while (guard-- > 0) {
    const ax = Math.abs(rx);
    const ay = Math.abs(ry);
    const az = Math.abs(rz);
    let axis: "x" | "y" | "z";
    // Ties break x → z → y, which keeps a limb reaching outward before it
    // reaches upward and is what makes the crown read as carried rather than
    // as piled.
    if (ax >= az && ax >= ay && ax > 0) axis = "x";
    else if (az >= ay && az > 0) axis = "z";
    else if (ay > 0) axis = "y";
    else break;
    if (axis === "x") {
      x += Math.sign(rx);
      rx -= Math.sign(rx);
    } else if (axis === "z") {
      z += Math.sign(rz);
      rz -= Math.sign(rz);
    } else {
      y += Math.sign(ry);
      ry -= Math.sign(ry);
    }
    putWood(b, { dx: x, dy: y, dz: z, part: "branch", axis, ...(dead ? { dead: true } : {}) });
  }
  return { x, y, z };
}

/**
 * The maximum radius a mass may take.
 *
 * Law 2 is the constraint: with `squash ≤ 0.75` a radius-4 ellipsoid reaches
 * taxicab 6 from its centre and no further, and its centre is always a wood
 * block. One block wider and the BFS runs past 6.
 */
export const MAX_MASS_RADIUS = 4;

/**
 * A leaf cluster: `blob`'s `≤ 1.15` ellipsoid, recentred.
 *
 * The centre **must** be a wood block of the same plant; every caller in this
 * file centres a mass on a trunk column or on a limb tip.
 */
function mass(b: Build, c: P3, radius: number, squash: number): void {
  const r = Math.max(1, Math.min(MAX_MASS_RADIUS, Math.round(radius)));
  const ry = Math.max(1, Math.round(r * squash));
  for (let dy = c.y - ry; dy <= c.y + ry; dy++) {
    for (let dz = c.z - r; dz <= c.z + r; dz++) {
      for (let dx = c.x - r; dx <= c.x + r; dx++) {
        const ox = dx - c.x;
        const oz = dz - c.z;
        const vy = (dy - c.y) / ry;
        if ((ox * ox + oz * oz) / (r * r) + vy * vy > 1.15) continue;
        if (has(b, dx, dy, dz)) continue;
        put(b, { dx, dy, dz, part: "leaves" });
      }
    }
  }
}

/**
 * A one-block-thick plate, with a spoke hub under it when it is wide.
 *
 * A bare disc of radius 5 reaches taxicab 7 from its centre — `(3, 4)` is
 * inside the circle — so the flat plate that makes an acacia an acacia would
 * break law 2 on its own. Four cardinal `branch` spokes one block below it
 * bring every plate column within 4 of wood, and they are also what stops the
 * plate reading as a detached lid.
 */
function plate(b: Build, c: P3, radius: number): void {
  const r = Math.max(1, Math.round(radius));
  if (r >= 4) {
    // The hub sits one block below the plate, so every spoke block is covered
    // by plate above it (law 1) and every plate column is near wood (law 2).
    for (const [ox, oz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      for (let k = 1; k <= r - 1; k++) {
        putWood(b, {
          dx: c.x + ox * k,
          dy: c.y - 1,
          dz: c.z + oz * k,
          part: "branch",
          axis: ox !== 0 ? "x" : "z",
        });
      }
    }
  }
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > r * r) continue;
      if (has(b, c.x + dx, c.y, c.z + dz)) continue;
      put(b, { dx: c.x + dx, dy: c.y, dz: c.z + dz, part: "leaves" });
    }
  }
}

/**
 * Hang a curtain of `n` blocks under `(x, y, z)`.
 *
 * Emitted top-down and contiguous, so every block has the plant's own block
 * directly above it and the emitter's support rule (§3.2) never has to drop
 * one; a curtain clipped by a structure still degrades to a shorter curtain.
 */
function curtain(b: Build, x: number, y: number, z: number, n: number): void {
  for (let k = 1; k <= n; k++) {
    const dy = y - k;
    // Never reach the ground: the undergrowth pass owns that column.
    if (dy <= 1) break;
    if (has(b, x, dy, z)) break;
    put(b, { dx: x, dy, dz: z, part: "hanging" });
  }
}

/**
 * Law 1 at the source: no block of **live** wood is the top of its column.
 *
 * Law 1 is suspended as a universal law (§9.4, ratified 2026-08-07). The target
 * property was never "no topmost log" — it was "no *accidental* bare mast", and
 * this pass is where that property is bought. It caps live construction, and it
 * leaves deliberately dead wood alone: a dead limb (`dead`) and a buttress ridge
 * (`buttress`) are the two enumerated things whose exposed top face is the
 * intent rather than the defect.
 *
 * Every program here ends with a cap mass or a plate over its own leader, which
 * is what §3.6–§3.10 argue is sufficient. It is not, and both counter-examples
 * were measured: a limb *rises* as it runs, so blocks partway along it stand
 * proud of the tip mass that covers its end (`beech_giant`, h = 20), and a
 * trunk with a gnarl term can wander back out of a column it visited lower down
 * (`spruce_ancient`, h = 16). Both are fixed the way the mega spruce's three
 * bare masts were — put a leaf on top of it — and it is also what a real branch
 * end looks like.
 */
function capWood(b: Build): void {
  const tops = new Map<string, { dx: number; dy: number; dz: number; exempt: boolean }>();
  for (const block of b.out) {
    if (block.part !== "log" && block.part !== "branch" && block.part !== "stem") continue;
    const k = `${block.dx},${block.dz}`;
    const seen = tops.get(k);
    if (seen === undefined || block.dy > seen.dy) {
      tops.set(k, {
        dx: block.dx,
        dy: block.dy,
        dz: block.dz,
        // The two enumerated exemptions of §9.4/§3.7.1: a root ends in a root,
        // and a dead limb ends in dead wood.
        exempt: block.buttress === true || block.dead === true,
      });
    }
  }
  for (const t of tops.values()) {
    // A buttress ridge is ground structure, not a mast: it is *supposed* to end
    // in bark at knee height, and a leaf on top of it would be a shrub growing
    // out of a root. Law 1 is no longer universal (§9.4), and §3.7.1 enumerates
    // the ridges as its one live-wood exception.
    if (t.exempt) continue;
    if (blockAt(b, t.dx, t.dy + 1, t.dz) !== undefined) continue;
    put(b, { dx: t.dx, dy: t.dy + 1, dz: t.dz, part: "leaves" });
  }
}

/** Read a `[lo, hi]` pair knob. */
function pair(
  def: FloraSpeciesDef,
  name: string,
  lo: number,
  hi: number,
): readonly [number, number] {
  const value = def.knobs?.[name];
  if (Array.isArray(value) && value.length === 2) return [value[0] as number, value[1] as number];
  return [lo, hi];
}

function pick(rng: () => number, [lo, hi]: readonly [number, number]): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/* -------------------------------------------------------------------------- */
/* broadleaf (§3.6)                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A deciduous crown is a set of masses on limbs, not one ellipsoid.
 *
 * At 60 blocks that is the whole difference: a blob is convex, a broadleaf is
 * lumpy and asymmetric, and the sky shows through between its masses.
 */
export const broadleaf: FloraProgram = {
  id: "broadleaf",
  canopyRadius(v, def) {
    // The limb run is `limb` or `limb + 1`, and the tip mass hangs off its end:
    // the bound has to cover the longest limb, not the nominal one.
    return Math.max(1, knob(def, "limb", 3) + 1 + knob(def, "mass", 2) + Math.max(0, v.radiusDelta));
  },
  blocks(v, def, rng) {
    const b = build();
    const height = Math.max(3, v.height);
    column(b, 0, 0, 0, height - 1);
    const n = Math.max(1, pick(rng, pair(def, "branches", 3, 5)));
    const fork = Math.max(2, Math.round(height * 0.55));
    const limb = knob(def, "limb", 3);
    const massR = knob(def, "mass", 2);
    for (let k = 0; k < n; k++) {
      const theta = (2 * Math.PI * (k + 0.5 * rng())) / n;
      const y0 = Math.min(height - 1, fork + Math.floor((k * (height - fork)) / n));
      const L = limb + (rng() < 0.5 ? 0 : 1);
      const tip = walkLimb(b, { x: 0, y: y0, z: 0 }, Math.cos(theta), Math.sin(theta), L, 2);
      mass(b, tip, massR + v.radiusDelta, 0.8);
    }
    // The crown cap: law 1 for the trunk column itself.
    mass(b, { x: 0, y: height, z: 0 }, massR, 0.9);
    capWood(b);
    return b.out;
  },
};

/* -------------------------------------------------------------------------- */
/* giant (§3.7)                                                                */
/* -------------------------------------------------------------------------- */

/** Trunk span of a giant at a given height (§3.7: 3 columns from 24 blocks). */
export function giantSpan(def: FloraSpeciesDef, height: number): number {
  const base = knob(def, "trunkSpan", 2);
  return height >= 24 ? Math.max(base, 3) : base;
}

/**
 * Buttress roots: radiating tapering ridges, seated into the ground (§3.7.1).
 *
 * This replaces the WP-B "skirt" — a broken ring of vertical `root` logs one or
 * two blocks below grade — which Kai's walk read as *flat brown tiles* around
 * the trunk, because a vertical log shows its ring texture on the top face and
 * the top face is the only face a skirt at grade presents to the player.
 *
 * The construction, and every clause of it is load-bearing:
 *
 * - **Radiating**: `4..7` ridges per tree at jittered angles, seeded per tree,
 *   so no two giants share a root plan and none of them reads as machined.
 * - **A ridge, not a ring**: each ridge walks outward one lattice axis per
 *   column (the 2-D form of {@link walkLimb}'s rule) from the trunk column
 *   furthest along its angle, so consecutive ridge columns are 6-adjacent and
 *   the first is 6-adjacent to the trunk (law 3, which live buttress wood obeys
 *   exactly as a limb does).
 * - **Tapering**: the ridge is `rootRise` blocks tall against the trunk and
 *   falls linearly to a single block at its foot, over `3..6` columns.
 * - **Bark, never rings**: every above-grade ridge block is a `branch` carrying
 *   the axis the walk just stepped — a *horizontal* log, whose top face is bark.
 *   That is the whole point of the rewrite.
 * - **Seated on slope**: every ridge column is filled downward to `rootDepth`
 *   with `root` blocks (vertical logs, and invisible: they are below grade).
 *   The programs cannot see the terrain (law 5), so the flare seats by being
 *   *deep* rather than by following a heightfield it is not allowed to read —
 *   a ridge foot up to `rootDepth` blocks downhill of the trunk still meets
 *   solid ground, and one uphill is simply buried.
 * - **Sunk one block** *(2026-08-09, Kai's walk of `oldgrowth_vale-3`: "roots
 *   look decent but allow them to go one block lower into the terrain")*: the
 *   ridge profile starts at `dy = -ROOT_SINK`, not at grade, so its bottom
 *   course is buried and the ridge **emerges** from the ground instead of
 *   resting on it. The seat is measured from the sunk ridge, not from grade, so
 *   `rootDepth` still buys `rootDepth` courses of `root` *below* the buried
 *   ridge block — the fill reaches `rootDepth + 1` below grade and the flare
 *   grips one block further down the slope than it did. (Measuring from the
 *   ridge rather than bumping the knob keeps the species table untouched: the
 *   shipped giants pin `rootDepth: 3` explicitly, so a default bump would have
 *   been inert for exactly the trees Kai walked.)
 */
/** How far below grade the visible ridge profile begins (§3.7.1). */
const ROOT_SINK = 1;
function buttressRoots(b: Build, def: FloraSpeciesDef, span: number, rng: () => number): void {
  const n = Math.max(1, pick(rng, pair(def, "buttresses", 4, 7)));
  const runRange = pair(def, "rootRun", 3, 6);
  const rise = Math.max(1, Math.round(knob(def, "rootRise", span >= 3 ? 3 : 2)));
  const depth = Math.max(1, Math.round(knob(def, "rootDepth", 3)));
  for (let k = 0; k < n; k++) {
    const theta = (2 * Math.PI * (k + 0.6 * rng())) / n;
    const dirX = Math.cos(theta);
    const dirZ = Math.sin(theta);
    const run = Math.max(2, pick(rng, runRange));
    let x = dirX >= 0 ? span - 1 : 0;
    let z = dirZ >= 0 ? span - 1 : 0;
    let rx = Math.round(dirX * run);
    let rz = Math.round(dirZ * run);
    const total = Math.abs(rx) + Math.abs(rz);
    if (total === 0) continue;
    for (let s = 1; s <= total; s++) {
      let axis: "x" | "z";
      if (Math.abs(rx) >= Math.abs(rz) && rx !== 0) {
        x += Math.sign(rx);
        rx -= Math.sign(rx);
        axis = "x";
      } else if (rz !== 0) {
        z += Math.sign(rz);
        rz -= Math.sign(rz);
        axis = "z";
      } else break;
      // Tall against the trunk, one block at the foot: `h` counts the blocks
      // in this column's ridge profile, and is never zero, so the ridge is one
      // unbroken chain from the trunk to its own toe. The profile starts one
      // block *below* grade (`ROOT_SINK`), so every ridge grows out of the
      // ground rather than sitting on top of it.
      const h = Math.max(1, Math.round(rise * (1 - (s - 1) / total)));
      for (let dy = -ROOT_SINK; dy < h - ROOT_SINK; dy++) {
        putWood(b, { dx: x, dy, dz: z, part: "branch", axis, buttress: true });
      }
      // The seat. `root` (a vertical log) below the buried ridge course, where
      // nobody sees its top face, and law 4's `dy ≤ 0` convention is untouched.
      for (let dy = -ROOT_SINK - 1; dy >= -depth - ROOT_SINK; dy--) put(b, { dx: x, dy, dz: z, part: "root" });
    }
  }
}

/**
 * Drape the underside of a crown (§3.7.2).
 *
 * Kai's walk: *"hanging growth genuinely might be underdone… there isn't much
 * besides vines"*. The answer within WP-B's material budget is **more vine, and
 * longer**, and hung where a player standing under a giant actually looks: the
 * rim of every mass, not one strand per limb.
 *
 * Same rim rule as `weeping` (§3.12) — a curtain hangs from a canopy column
 * with an open 4-neighbour, never from the whole underside, or the crown
 * becomes a solid cylinder. Only masses well above the ground drape, so a vine
 * never reaches down into the walk-under space the giant exists to create.
 */
function drapeCrown(
  b: Build,
  def: FloraSpeciesDef,
  rng: () => number,
  floor: number,
): void {
  const share = knob(def, "hangingShare", 0.45);
  const [lo, hi] = pair(def, "curtain", 3, 8);
  const lowest = new Map<string, { dx: number; dy: number; dz: number }>();
  for (const block of b.out) {
    if (block.part !== "leaves") continue;
    const k = `${block.dx},${block.dz}`;
    const seen = lowest.get(k);
    if (seen === undefined || block.dy < seen.dy) {
      lowest.set(k, { dx: block.dx, dy: block.dy, dz: block.dz });
    }
  }
  for (const [k, c] of lowest) {
    if (c.dy < floor) continue;
    const [dx, dz] = k.split(",").map(Number) as [number, number];
    const rim =
      !lowest.has(`${dx + 1},${dz}`) ||
      !lowest.has(`${dx - 1},${dz}`) ||
      !lowest.has(`${dx},${dz + 1}`) ||
      !lowest.has(`${dx},${dz - 1}`);
    if (!rim) continue;
    if (rng() >= share) continue;
    curtain(b, dx, c.dy, dz, lo + Math.floor(rng() * (hi - lo + 1)));
  }
}

/**
 * The emergent: a column with a ceiling.
 *
 * Three things carry that read and all three are load-bearing — a trunk more
 * than one column wide, a root flare that seats it into the ground, and a crown
 * carried on real limbs high enough that a player walks *under* it.
 *
 * **Grandeur (2026-08-07).** Kai's canopy fly-over of `oldgrowth_vale`: *"giants
 * def don't anchor the skyline — not a single growth meaningfully more grand
 * than vanilla generation"*, and the instrument agreed: the three placed beeches
 * cleared the p95 canopy top within 24 columns by 12, 8 and 5 blocks. A tree
 * that stands 5 blocks over its neighbours is not an emergent, it is a tall
 * tree. So the program now builds:
 *
 * - a **leader** running `leader` blocks past the trunk top rather than 2, and
 * - a **compound crown** — a central mass on the leader plus an upper whorl of
 *   short limbs, each carrying its own mass — because a single mass is capped at
 *   {@link MAX_MASS_RADIUS} by law 2 and a radius-4 dome is simply not a
 *   skyline, while four masses on wood are a radius-9 one that still keeps every
 *   leaf within BFS 6 of a branch, and
 * - **longer, more numerous main limbs**, which is what makes the crown a
 *   ceiling to walk under rather than a hat.
 *
 * The species envelopes carry the rest (§4.1): a beech is 26–34 and a kapok
 * 30–40, against 20–28 and 22–30 before.
 */
export const giant: FloraProgram = {
  id: "giant",
  canopyRadius(v, def) {
    const span = giantSpan(def, Math.max(8, v.height));
    const rd = Math.max(0, v.radiusDelta);
    // A main limb starts from the far trunk column (`span − 1`), runs
    // `limb + 0..2`, and carries a mass on its tip.
    const limbs = span - 1 + knob(def, "limb", 6) + 2 + knob(def, "mass", 3) + rd;
    // A crown limb starts on the leader (the middle column) and is shorter.
    const crown = span - 1 + knob(def, "crownRun", 4) + 1 + knob(def, "crown", 4) + rd;
    // A buttress ridge reaches `rootRun` columns from the trunk's far side.
    const roots = span - 1 + pair(def, "rootRun", 3, 6)[1];
    return Math.max(1, limbs, crown, roots);
  },
  blocks(v, def, rng) {
    const b = build();
    const height = Math.max(8, v.height);
    const span = giantSpan(def, height);
    const cols: P3[] = [];
    for (let i = 0; i < span; i++) {
      for (let j = 0; j < span; j++) cols.push({ x: i, y: 0, z: j });
    }
    for (const c of cols) column(b, c.x, c.z, 0, height - 1);
    // The leader carries on past the trunk so the crown's centre is itself wood
    // — which is what keeps the crown's leaf BFS inside 6 (law 2) — and it is
    // also the mast the upper whorl hangs off.
    const cx = Math.floor((span - 1) / 2);
    const leader = Math.max(1, Math.round(knob(def, "leader", 3)));
    column(b, cx, cx, height, height + leader);

    // --- buttress roots (§3.7.1) ---------------------------------------------
    buttressRoots(b, def, span, rng);

    // --- branch skeleton ------------------------------------------------------
    const n = Math.max(1, pick(rng, pair(def, "branches", 5, 8)));
    const base = Math.round(height * 0.55);
    const limb = knob(def, "limb", 6);
    const massR = knob(def, "mass", 3);
    for (let k = 0; k < n; k++) {
      const theta = (2 * Math.PI * (k + 0.6 * rng())) / n;
      const y0 = Math.min(height - 1, base + Math.floor((k * (height - base)) / n));
      // Start from the trunk column furthest along theta.
      const sx = Math.cos(theta) >= 0 ? span - 1 : 0;
      const sz = Math.sin(theta) >= 0 ? span - 1 : 0;
      const L = limb + Math.floor(rng() * 3);
      const tip = walkLimb(b, { x: sx, y: y0, z: sz }, Math.cos(theta), Math.sin(theta), L, 3);
      mass(b, tip, massR + v.radiusDelta, 0.7);
    }

    // --- the crown: a central mass on the leader, plus an upper whorl ---------
    const crownR = knob(def, "crown", 4);
    const crownN = Math.max(1, pick(rng, pair(def, "crownLimbs", 4, 6)));
    const crownRun = Math.max(2, Math.round(knob(def, "crownRun", 4)));
    for (let k = 0; k < crownN; k++) {
      const theta = (2 * Math.PI * (k + 0.5 + 0.5 * rng())) / crownN;
      const y0 = height + Math.min(leader, 1 + (k % 2));
      const tip = walkLimb(
        b,
        { x: cx, y: y0, z: cx },
        Math.cos(theta),
        Math.sin(theta),
        crownRun + (rng() < 0.5 ? 0 : 1),
        k % 2,
      );
      mass(b, tip, crownR + v.radiusDelta, 0.7);
    }
    // The centre, which is what caps every trunk column (law 1 for all span² of
    // them) and closes the dome the whorl opened.
    mass(b, { x: cx, y: height + leader, z: cx }, crownR + v.radiusDelta, 0.6);
    capWood(b);

    // --- the drape (§3.7.2) ---------------------------------------------------
    if (def.hangingSymbol !== undefined) {
      // Nothing below 60% of the trunk drapes: the walk-under space is the
      // point of a giant, and a vine curtain in it is a curtain across a
      // cathedral nave.
      drapeCrown(b, def, rng, Math.round(height * 0.6));
    }
    return b.out;
  },
};

/* -------------------------------------------------------------------------- */
/* ancient (§3.8)                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The tree with a history: a leaning, gnarled trunk with a thinned crown, dead
 * limbs and shelf fungi.
 *
 * The `while` loops are the whole trick, and they protect law 1 *and* law 3:
 * the trunk moves at most one column per block of rise and emits every
 * intermediate column, so however far it leans it stays one 6-connected
 * component and every column it passes through is topped by the column above.
 */
export const ancient: FloraProgram = {
  id: "ancient",
  canopyRadius(v, def) {
    return Math.max(
      1,
      knob(def, "leanMax", 3) + knob(def, "limb", 3) + knob(def, "mass", 3) + Math.max(0, v.radiusDelta),
    );
  },
  blocks(v, def, rng) {
    const b = build();
    const height = Math.max(4, v.height);
    const leanMax = Math.max(1, knob(def, "leanMax", 3));
    // `age` is the full `0..1` since §9.4's suspension: a fully dead standing
    // snag ends in bare wood, and bare wood is legal geometry now. What bounds
    // the age of a shipped tree is the species' own `age` envelope, not a law.
    const age = Math.min(1, Math.max(0, v.age ?? 0.5));
    let lean = v.lean;
    if (lean === undefined) {
      const theta = 2 * Math.PI * rng();
      lean = { x: Math.cos(theta), z: Math.sin(theta) };
    }
    let x = 0;
    let z = 0;
    let fx = 0;
    let fz = 0;
    put(b, { dx: 0, dy: 0, dz: 0, part: "log" });
    const spine: P3[] = [{ x: 0, y: 0, z: 0 }];
    for (let dy = 1; dy < height; dy++) {
      fx += lean.x / 4;
      fz += lean.z / 4;
      if (rng() < 0.35 * age) fx += (rng() < 0.5 ? -1 : 1) * 0.6;
      if (rng() < 0.35 * age) fz += (rng() < 0.5 ? -1 : 1) * 0.6;
      const nx = Math.round(Math.max(-leanMax, Math.min(leanMax, fx)));
      const nz = Math.round(Math.max(-leanMax, Math.min(leanMax, fz)));
      // Move at most one column per block of rise, emitting every column the
      // trunk passes through, so the trunk is a single 6-connected component.
      while (x !== nx) {
        x += Math.sign(nx - x);
        put(b, { dx: x, dy, dz: z, part: "log" });
      }
      while (z !== nz) {
        z += Math.sign(nz - z);
        put(b, { dx: x, dy, dz: z, part: "log" });
      }
      put(b, { dx: x, dy, dz: z, part: "log" });
      spine.push({ x, y: dy, z });
      if (def.decoSymbol !== undefined && rng() < 0.06 * age && dy > 1) {
        // A shelf beside the trunk, 6-adjacent to it: full cube, so law 6 wants
        // it attached and the emitter's `deco` rule wants a wood neighbour.
        const side = Math.floor(rng() * 4);
        const ox = side === 0 ? 1 : side === 1 ? -1 : 0;
        const oz = side === 2 ? 1 : side === 3 ? -1 : 0;
        if (!has(b, x + ox, dy, z + oz)) put(b, { dx: x + ox, dy, dz: z + oz, part: "deco" });
      }
    }

    const limbs = Math.max(1, pick(rng, pair(def, "branches", 3, 5)));
    const live = Math.max(1, Math.ceil((1 - 0.5 * age) * limbs));
    const limb = knob(def, "limb", 3);
    const massR = knob(def, "mass", 3);
    for (let k = 0; k < limbs; k++) {
      const at = spine[
        Math.min(spine.length - 1, Math.max(1, Math.round(height * (0.6 + (0.3 * k) / limbs))))
      ] as P3;
      const theta = (2 * Math.PI * (k + 0.5)) / limbs;
      const dead = k >= live;
      const tip = walkLimb(
        b,
        at,
        Math.cos(theta),
        Math.sin(theta),
        limb,
        1 + (k % 2),
        dead,
      );
      // A dead limb is a limb without a cluster, and since §9.4's suspension it
      // ends in the dead wood it is made of: the single terminating leaf it
      // used to carry was law 1 speaking, and a green sprig on the tip of a
      // stripped, sun-bleached limb is precisely the thing the law was never
      // meant to buy.
      if (!dead) mass(b, tip, massR + v.radiusDelta, 0.75);
    }
    mass(b, { x, y: height, z }, Math.max(1, massR - Math.round(2 * age)), 0.8);

    capWood(b);
    return b.out;
  },
};

/* -------------------------------------------------------------------------- */
/* columnar (§3.9)                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The narrowest useful silhouette: a tight vertical ellipsoid over the top half
 * of the trunk. Deliberately the same `≤ 1.15` test `blob` uses, so the two
 * read as one family seen from different distances.
 */
export const columnar: FloraProgram = {
  id: "columnar",
  canopyRadius(v, def) {
    return Math.max(1, knob(def, "radius", 2) + v.radiusDelta);
  },
  blocks(v, def, rng) {
    const b = build();
    const height = Math.max(4, v.height);
    column(b, 0, 0, 0, height - 1);
    const r = Math.max(1, Math.min(3, knob(def, "radius", 2) + v.radiusDelta));
    const ry = Math.max(2, Math.round(height * knob(def, "ratio", 0.45)));
    const cy = height - ry + 1;
    // Studs on the bare shaft (WP-C). Gated on `decoSymbol`, which no
    // naturalistic columnar species declares — so `larch_columnar` draws
    // nothing here and its geometry is untouched — and placed *before* the
    // crown so a stud always wins its cell over a leaf.
    //
    // §4.1 gives `crystal_spire` a `crystal.cluster` deco, and a declared
    // symbol no program ever emits is a dial that reports success and changes
    // nothing. The stud sits against the shaft rather than on the crown's
    // surface because §3.2 derives a `facing` block's orientation from a *wood*
    // 6-neighbour and drops it when there is none: a cluster out on the crown
    // would be dropped, silently, every time.
    if (def.decoSymbol !== undefined) {
      const share = knob(def, "decoShare", 0.18);
      for (let dy = 1; dy < Math.max(2, cy - ry); dy++) {
        if (rng() >= share) continue;
        const side = Math.floor(rng() * 4);
        const ox = side === 0 ? 1 : side === 1 ? -1 : 0;
        const oz = side === 2 ? 1 : side === 3 ? -1 : 0;
        if (!has(b, ox, dy, oz)) put(b, { dx: ox, dy, dz: oz, part: "deco" });
      }
    }
    for (let dy = cy - ry; dy <= cy + ry; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dz === 0 && dy < height) continue;
          const vy = (dy - cy) / ry;
          if ((dx * dx + dz * dz) / (r * r) + vy * vy > 1.15) continue;
          if (has(b, dx, dy, dz)) continue;
          put(b, { dx, dy, dz, part: "leaves" });
        }
      }
    }
    return b.out;
  },
};

/* -------------------------------------------------------------------------- */
/* umbrella (§3.10)                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Bare trunk, flat plate.
 *
 * What makes it read as savannah rather than as a mushroom is that the plate is
 * offset from the trunk and reached by a short limb, and that there are two
 * plates at different heights.
 */
export const umbrella: FloraProgram = {
  id: "umbrella",
  canopyRadius(v, def) {
    return Math.max(2, knob(def, "radius", 4) + v.radiusDelta) + 2;
  },
  blocks(v, def, rng) {
    const b = build();
    const height = Math.max(3, v.height);
    column(b, 0, 0, 0, height - 1);
    const R = Math.max(2, Math.min(5, knob(def, "radius", 4) + v.radiusDelta));
    // The main plate sits directly over the trunk top, so its spoke hub has the
    // trunk's last log to hang from.
    plate(b, { x: 0, y: height, z: 0 }, R);
    plate(b, { x: 0, y: height - 1, z: 0 }, Math.max(1, R - 2));
    if (knob(def, "plates", 2) > 1 && height >= 6) {
      const sx = rng() < 0.5 ? -1 : 1;
      const sz = rng() < 0.5 ? -1 : 1;
      const ox = sx * (1 + Math.floor(rng() * 2));
      const oz = sz * (1 + Math.floor(rng() * 2));
      const run = Math.abs(ox) + Math.abs(oz);
      const tip = walkLimb(b, { x: 0, y: height - 3, z: 0 }, ox / run, oz / run, run, 1);
      plate(b, { x: tip.x, y: tip.y + 1, z: tip.z }, Math.max(2, R - 1));
    }
    capWood(b);
    return b.out;
  },
};

/* -------------------------------------------------------------------------- */
/* weeping (§3.12)                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `blob`'s canopy with curtains hung off its rim.
 *
 * The construction rule that matters: **curtains hang from the rim, not from
 * the whole underside**, or the tree becomes a solid green cylinder and a
 * player cannot walk into it.
 */
export const weeping: FloraProgram = {
  id: "weeping",
  canopyRadius(v, def) {
    return Math.max(1, knob(def, "radius", 2) + v.radiusDelta);
  },
  blocks(v, def, rng) {
    const b = build();
    const height = Math.max(3, v.height);
    column(b, 0, 0, 0, height - 1);
    const r = Math.max(1, Math.min(MAX_MASS_RADIUS, knob(def, "radius", 2) + v.radiusDelta));
    const squash = knob(def, "squash", 1);
    const cy = height - 1;
    const ry = Math.max(1, Math.round(r * squash));
    // Canopy columns, and the lowest canopy block of each — the rim test and
    // the curtain anchor both read this.
    const lowest = new Map<string, number>();
    for (let dy = cy - ry; dy <= cy + ry; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dz === 0 && dy < height) continue;
          const vy = (dy - cy) / ry;
          if ((dx * dx + dz * dz) / (r * r) + vy * vy > 1.15) continue;
          if (has(b, dx, dy, dz)) continue;
          put(b, { dx, dy, dz, part: "leaves" });
          const k = `${dx},${dz}`;
          const seen = lowest.get(k);
          if (seen === undefined || dy < seen) lowest.set(k, dy);
        }
      }
    }
    if (def.hangingSymbol === undefined) return b.out;
    const share = knob(def, "curtainShare", 0.6);
    const [lo, hi] = pair(def, "curtain", 2, 5);
    // Iterate in a fixed order — the map's insertion order is the emission
    // order, which is itself deterministic — so the draws are reproducible.
    for (const [k, y] of lowest) {
      const [dx, dz] = k.split(",").map(Number) as [number, number];
      const rim =
        !lowest.has(`${dx + 1},${dz}`) ||
        !lowest.has(`${dx - 1},${dz}`) ||
        !lowest.has(`${dx},${dz + 1}`) ||
        !lowest.has(`${dx},${dz - 1}`);
      if (!rim) continue;
      if (rng() >= share) continue;
      curtain(b, dx, y, dz, lo + Math.floor(rng() * (hi - lo + 1)));
    }
    return b.out;
  },
};

/** The naturalistic half of `SHAPE_PROGRAMS` (§3.6–§3.12, fungal excepted). */
export const NATURALISTIC_PROGRAMS = Object.freeze({
  broadleaf,
  giant,
  ancient,
  columnar,
  umbrella,
  weeping,
} satisfies Readonly<Record<string, FloraProgram>>);
