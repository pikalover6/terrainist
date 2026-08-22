/**
 * The environs of the Troy demo — the siege camp on the plain, the
 * necropolis on its knoll, the grove-keepers among the olive terraces.
 * Same two-moment contract as `town.mjs`, same laws
 * (`docs/COHERENT-SOURCE-v0.md`): sketch is pure data before the freeze;
 * structures stand on `groundAt` after it and never move earth.
 *
 * Everything here stands ON the ground the plan froze. The single exception
 * the law sanctions is used exactly once and deliberately: the necropolis's
 * grave markers REPLACE the surface block at the plan's own level.
 */

import { townSketch } from "./town.mjs";

const TAU = 2 * Math.PI;

/** The war camp's open side: the approach toward the horse pad and war road. */
const CAMP_OPEN_ANGLE = -0.71;   // bearing camp -> horse pad / war road head
const CAMP_OPEN_HALF = 0.75;     // half-width of the wedge left clear

/** The horse's envelope (the core stamps it) plus the berth we owe it. */
const HORSE_HALF_X = 8 + 10;     // 15 wide -> half 8, plus 10 berth
const HORSE_HALF_Z = 12 + 10;    // 23 deep -> half 12, plus 10 berth

/** Camp ring: [angle, radius, archetype, sx, sy, sz]. */
const CAMP_RING = [
  [0.55, 22, "khans_ger", 9, 7, 9],
  [1.15, 25, "hut", 7, 6, 6],
  [1.75, 20, "khans_ger", 9, 7, 9],
  [2.35, 24, "shepherds_bothy", 8, 6, 7],
  [2.95, 19, "longhouse", 15, 8, 9],   // the command tent, at the camp's back
  [3.60, 23, "khans_ger", 9, 7, 9],
  [4.25, 21, "khans_ger", 9, 7, 9],
];

/** True inside the berth we keep clear around the standing horse. */
const nearHorse = (HORSE_PAD, x, z) =>
  Math.abs(x - HORSE_PAD.x) <= HORSE_HALF_X && Math.abs(z - HORSE_PAD.z) <= HORSE_HALF_Z;

/**
 * The environs' asks: the siege camp's tent ring and a grove-keeper's hut at
 * a grove edge. Pure data — the core owns rejection and seating.
 */
export function environsSketch(anchors) {
  const { CAMP, HORSE_PAD, GROVES } = anchors;
  const sites = [];
  const put = (x, z, facing, size, archetype, floors) =>
    sites.push({ x, z, facing, size, archetype, floors });

  /* --- the siege camp: tents ringing the fire, east approach left open --- */
  for (const [a, r, archetype, sx, sy, sz] of CAMP_RING) {
    let da = Math.abs(((a - CAMP_OPEN_ANGLE + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (da < CAMP_OPEN_HALF) continue; // the approach stays clear
    const x = Math.round(CAMP.x + r * Math.cos(a));
    const z = Math.round(CAMP.z + r * Math.sin(a));
    if (nearHorse(HORSE_PAD, x, z)) continue;
    // Every tent looks in at the fire.
    put(x, z, Math.atan2(CAMP.z - z, CAMP.x - x), [sx, sy, sz], archetype, 1);
  }

  /* --- the grove keepers: one hut at each of two grove edges ------------- */
  // Set at the grove's far side from the lane head (which comes in from the
  // north-west), so the keeper's yard never sits on the ribbon.
  put(GROVES[2].x, GROVES[2].z + 20, -Math.PI / 2, [8, 6, 7], "shepherds_bothy", 1);
  put(GROVES[0].x - 21, GROVES[0].z + 12, 0, [7, 6, 6], "hut", 1);

  return { sites };
}

/**
 * Everything the environs STAND on the frozen ground: the camp's fire circle,
 * its banner posts and the ruin of its earthwork; the necropolis's stone ring,
 * cairn and grave markers; the dry-stone field walls among the olive terraces.
 */
export function environsStructures({ anchors, groundAt, st, stack, SEA, positionFloat, streamSeed, SEED, onRoad }) {
  const { CAMP, HORSE_PAD, KNOLL, GROVES, CITADEL } = anchors;

  /* One writer, even inside this function: every block goes through `put`,
     keyed by column, so two environs features can never both claim a cell. */
  const cells = new Map();
  const put = (x, y, z, stateId) => { cells.set(x + "," + y + "," + z, { x, y, z, stateId }); };

  const cobble = st("cobblestone");
  const mossy = st("mossy_cobblestone");
  const smoothStone = st("smooth_stone");
  const fenceState = st("oak_fence", { north: "false", south: "false", east: "false", west: "false", waterlogged: "false" });
  const lanternState = st("lantern", { hanging: "false", waterlogged: "false" });

  // The campfire, if this version's block resolves with its full state set;
  // otherwise a torch on a cobble plinth says the same thing.
  let fireState = null;
  try {
    fireState = st("campfire", { facing: "north", lit: "true", signal_fire: "false", waterlogged: "false" });
  } catch {
    fireState = null;
  }
  const torchState = st("torch");

  const rnd = (stream, x, y, z) => positionFloat(streamSeed(SEED, stream), x, y, z);
  /** Cobble or mossy cobble, chosen from the column itself. */
  const stoneMix = (stream, x, y, z) => (rnd(stream, x, y, z) < 0.55 ? cobble : mossy);

  // Building sites the core may keep — town's and ours. Structures step around
  // them so a wall fragment never lands inside somebody's doorway.
  const siteCentres = [...townSketch(anchors).sites, ...environsSketch(anchors).sites];
  const nearSite = (x, z, d) => siteCentres.some((s) => Math.abs(s.x - x) < d && Math.abs(s.z - z) < d);

  /** A column that will take a structure block standing on the ground. */
  const clear = (x, z, siteBerth = 6) => {
    if (onRoad(x, z)) return false;
    if (groundAt(x, z) <= SEA) return false;
    if (nearHorse(HORSE_PAD, x, z)) return false;
    if (nearSite(x, z, siteBerth)) return false;
    return true;
  };

  const counts = { firePosts: 0, earthwork: 0, stones: 0, markers: 0, groveWall: 0 };

  /* ===================================================================== */
  /* A — THE SIEGE CAMP                                                     */
  /* ===================================================================== */

  /* The fire circle: a cobble ring two out from the fire, on the ground. */
  {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const d = Math.hypot(dx, dz);
      if (d < 1.6 || d > 2.4) continue;
      const x = CAMP.x + dx, z = CAMP.z + dz;
      if (!clear(x, z, 4)) continue;
      put(x, groundAt(x, z) + 1, z, stoneMix("camp-fire-ring", x, 0, z));
    }
    const fy = groundAt(CAMP.x, CAMP.z);
    if (fy > SEA) {
      if (fireState !== null) {
        put(CAMP.x, fy + 1, CAMP.z, fireState);
      } else {
        put(CAMP.x, fy + 1, CAMP.z, cobble);
        put(CAMP.x, fy + 2, CAMP.z, torchState);
      }
    }
  }

  /* Banner and tether posts: a loose inner ring, some crowned with a lantern. */
  {
    for (let i = 0; i < 6; i++) {
      const a = 0.4 + (i * TAU) / 6;
      const r = 11 + (i % 2 === 0 ? 0 : 2);
      const x = Math.round(CAMP.x + r * Math.cos(a));
      const z = Math.round(CAMP.z + r * Math.sin(a));
      if (!clear(x, z, 5)) continue;
      const y = groundAt(x, z);
      put(x, y + 1, z, fenceState);
      put(x, y + 2, z, fenceState);
      put(x, y + 3, z, rnd("camp-post", x, y, z) < 0.5 ? lanternState : torchState);
      counts.firePosts++;
    }
  }

  /* The earthwork: a single course of stone along the camp's city-facing edge,
     already more ruin than rampart — the gaps are the point. */
  {
    const toCity = Math.atan2(CITADEL.z - CAMP.z, CITADEL.x - CAMP.x);
    const R = CAMP.r - 4;
    const steps = Math.ceil(2 * R * 1.6);
    for (let i = 0; i <= steps; i++) {
      const a = toCity - 0.85 + (1.7 * i) / steps;
      for (const rr of [R, R - 1]) {
        const x = Math.round(CAMP.x + rr * Math.cos(a));
        const z = Math.round(CAMP.z + rr * Math.sin(a));
        if (!clear(x, z, 5)) continue;
        const y = groundAt(x, z);
        if (rnd("camp-earthwork", x, y, z) < 0.32) continue; // the ruin's gaps
        put(x, y + 1, z, stoneMix("camp-earthwork-mix", x, y, z));
        counts.earthwork++;
      }
    }
  }

  /* ===================================================================== */
  /* B — THE NECROPOLIS                                                     */
  /* ===================================================================== */

  {
    /* The ring: nine standing stones, two or three high. */
    for (let i = 0; i < 9; i++) {
      const a = 0.2 + (i * TAU) / 9;
      const x = Math.round(KNOLL.x + 8 * Math.cos(a));
      const z = Math.round(KNOLL.z + 8 * Math.sin(a));
      if (!clear(x, z, 5)) continue;
      const y = groundAt(x, z);
      const h = rnd("necro-stone-h", x, y, z) < 0.45 ? 3 : 2;
      for (let k = 1; k <= h; k++) put(x, y + k, z, stoneMix("necro-stone", x, y + k, z));
      counts.stones++;
    }

    /* The cairn: a three-wide course, then a single stack two courses more. */
    {
      const cx = KNOLL.x, cz = KNOLL.z;
      let ok = true;
      for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!clear(cx + dx, cz + dz, 5)) { ok = false; break; }
      }
      if (ok) {
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx, z = cz + dz;
          put(x, groundAt(x, z) + 1, z, stoneMix("necro-cairn", x, 1, z));
        }
        const cy = groundAt(cx, cz);
        for (let k = 2; k <= 4; k++) put(cx, cy + k, cz, stoneMix("necro-cairn", cx, cy + k, cz));
      }
    }

    /* Grave markers: THE sanctioned swap — the surface block at the plan's own
       level becomes worked stone. No block is added above the ground. */
    for (let i = 0; i < 22; i++) {
      const a = (i * 2.399963) + 0.7;                    // a deterministic spiral
      const r = 3 + 4.4 * ((i * 7) % 11) / 10;
      const x = Math.round(KNOLL.x + r * Math.cos(a));
      const z = Math.round(KNOLL.z + r * Math.sin(a));
      if (Math.abs(x - KNOLL.x) <= 1 && Math.abs(z - KNOLL.z) <= 1) continue; // the cairn's
      if (!clear(x, z, 5)) continue;
      const y = groundAt(x, z);
      if (rnd("necro-marker", x, y, z) < 0.45) continue;
      put(x, y, z, smoothStone);
      counts.markers++;
    }
  }

  /* ===================================================================== */
  /* C — THE GROVES                                                         */
  /* ===================================================================== */

  for (let gi = 0; gi < GROVES.length; gi++) {
    const g = GROVES[gi];
    for (let j = 0; j < 3; j++) {
      const a = 0.6 + gi * 0.9 + j * 2.2;
      const rr = g.r * 0.5 + j * 3;
      const sx = Math.round(g.x + rr * Math.cos(a));
      const sz = Math.round(g.z + rr * Math.sin(a));
      // The wall runs across the slope, tangential to the terrace's centre.
      const dirA = a + Math.PI / 2 + (j % 2 === 0 ? 0 : Math.PI);
      const ux = Math.cos(dirA), uz = Math.sin(dirA);
      const len = 6 + Math.floor(rnd("grove-wall-len", sx, gi, sz) * 7); // 6..12
      let prevY = null;
      for (let t = 0; t < len; t++) {
        const x = Math.round(sx + ux * t), z = Math.round(sz + uz * t);
        if (!clear(x, z, 6)) { prevY = null; continue; }
        const y = groundAt(x, z);
        // The ground steps: the dry-stone run breaks there, as they do.
        if (prevY !== null && Math.abs(y - prevY) > 1) { prevY = y; continue; }
        prevY = y;
        if (rnd("grove-wall", x, y, z) < 0.14) continue;
        put(x, y + 1, z, stoneMix("grove-wall-mix", x, y, z));
        counts.groveWall++;
      }
    }
  }

  const blocks = [...cells.values()];
  return { blocks, counts };
}
