/**
 * Archetype breadth, **wave six E** — the relics: five ruined buildings.
 *
 * A ruined cottage, a ruined keep, a ruined church, a collapsed tower and an
 * overgrown villa. The five monuments this wave ships beside them — the
 * standing stones, the henge, the monolith, the burial mound, the two digs and
 * the shattered obelisk — are **props**, and live in `props-relics.ts`: a
 * monument has no room in it, and a building grammar that builds a solid lump
 * is a building grammar being misused.
 *
 * ## THE RUIN LAW
 *
 * **A ruined building is the ordinary shell fit-out DECAYED, not a second
 * grammar.**
 *
 * This is the same statement `archetypes-blitz.ts` makes about archetypes in
 * general, pushed to the one place it looks like it should break. The fit-out
 * runs **after** every shape stage and a later write to a cell replaces an
 * earlier one, so "ruined" is not a different builder, a different footprint
 * or a different opening rule — it is the same shell, written over. No new
 * geometry is invented here; existing geometry is *removed* and *re-clad*.
 *
 * Decay is five moves, in this order, and the order is load-bearing:
 *
 * 1. **The crumble line.** Each ring column keeps a surviving height derived
 *    from its own coordinates (see {@link crumbleHeight}); everything above it
 *    — wall, window, eaves, roof, apron — is written to `air`, **from the top
 *    down**. A column is cleared as a whole run to its survivor: no mid-height
 *    hole is ever punched, because a punched hole is exactly how a full cube
 *    ends up with six air faces, which is the lint's `floating.isolated` and
 *    the turret lesson restated.
 * 2. **Re-clad the survivors.** What is left is written back in mossy and
 *    cracked variants, so the standing courses read as weathered rather than
 *    as freshly cut.
 * 3. **Break the roof to fragments that never float.** The roof is cleared
 *    outright and then a fragment is laid **only** on the head of a ring
 *    column that survived to the eave plate. Every fragment therefore has the
 *    wall it rests on directly beneath it. Nothing is ever laid over the room.
 * 4. **Rubble on the floor.** Cobble and mossy-cobble heaps as **full blocks**
 *    at `y = 1`, every one of them through {@link PropCounter.put1} — which
 *    routes through the ground floor's own `free`/`take`, so the room stays
 *    walkable *around* the heaps. Moss carpet goes on **rubble tops only**: a
 *    carpet is in the lint's `NEEDS_GROUND` set and needs something under it.
 * 5. **Green.** `vine` is in the pinned 1.21.11 block table (verified), so the
 *    growth is real vines hung on the **inside face of a surviving wall**,
 *    with the face property pointing at the wall that holds them, plus moss
 *    carpet on the rubble.
 *
 * ## What decay may never touch
 *
 * - **the door, and the approach to it.** The walking agent starts in the cell
 *   inside the door and the lint's `traversal.unreachable` walk starts there
 *   too. {@link protectedColumn} keeps the door column, the doorstep outside
 *   it and the cell inside it out of every one of the five moves, and the test
 *   file re-walks every envelope with `assertNoPockets`;
 * - **the interior's reachability.** Every open cell must still be reachable
 *   from the door. Rubble goes through `take`, which refuses any placement
 *   that would strand a cell;
 * - **no fire and no fluids.** A ruin is cold and dry. No campfire, no water,
 *   no lava — a burning ruin is a fire, and a flooded one is a fluid-lint
 *   failure waiting to happen;
 * - **no chains** (`chain` is not in the pinned block table at all; `iron_bars`
 *   carries the read), and **no signs** (a sign is a block entity the op
 *   stream cannot carry; a wall banner is the signage idiom).
 */

import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
} from "./archetypes-civic.js";
import { cardinalStep, type LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The five ruined buildings this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`.
 */
export const RELIC_BUILDING_ARCHETYPES = [
  "ruined_cottage",
  "ruined_keep",
  "ruined_church",
  "collapsed_tower",
  "overgrown_villa",
] as const;

/** One of the archetypes this file fits out. */
export type RelicBuildingArchetype = (typeof RELIC_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isRelicArchetype(value: string): value is RelicBuildingArchetype {
  return (RELIC_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted straight after the commerce table and well before the extended
 * one. Every tag below is a **compound**, and the near misses are the whole of
 * the review:
 *
 * - **bare `ruin` and `ruins` are deliberately NOT claimed.** An author who
 *   writes `"ruins"` and nothing else has not said *what* is ruined, and any
 *   answer this table gave would be a choice made on their behalf: a ruined
 *   cottage and a shattered obelisk are both honest readings. Both tags
 *   therefore keep falling through to the extended table's `cottage` default,
 *   and `docs/kits/settlement-author.md` records the question for Kai;
 * - **bare `abbey` is not ours** — it is wave 4B's **abbey**, and claiming it
 *   would silently ruin every abbey in the vocabulary. The ruined church
 *   answers to `ruined_abbey` and `abbey_ruin`, which are compounds nothing
 *   else wants;
 * - **bare `keep`, `castle` and `tower` are not ours** either: those are the
 *   breadth keep's and the watchtower's. The ruined keep answers to
 *   `ruined_keep`, `ruined_castle` and `castle_ruin`, and the collapsed tower
 *   to `collapsed_tower`, `broken_tower` and `tower_ruin`;
 * - **bare `villa` is the Mediterranean villa's** and bare `house` still falls
 *   through to a cottage;
 * - **bare `overgrown` is not claimed.** It is an adjective, not a building —
 *   an overgrown *anything* is a plausible request, and this table must not be
 *   the one that decides an unqualified adjective means a villa.
 */
export function relicArchetypeOfTags(tags: readonly string[]): RelicBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("ruined_cottage") || has("ruined_house") || has("derelict_cottage")) {
    return "ruined_cottage";
  }
  if (has("ruined_keep") || has("ruined_castle") || has("castle_ruin")) return "ruined_keep";
  if (has("ruined_church") || has("ruined_chapel") || has("ruined_abbey") || has("abbey_ruin")) {
    return "ruined_church";
  }
  if (has("collapsed_tower") || has("broken_tower") || has("tower_ruin")) return "collapsed_tower";
  if (has("overgrown_villa") || has("villa_ruin") || has("ruined_villa")) return "overgrown_villa";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one.
 *
 * Every ruin here asks for a **gable** and for **tall, sparse** openings, and
 * both are deliberate. A gable's shape is the one the crumble reads best
 * against — the roof is coming off anyway, and what survives is a wall head
 * with a jag in it. Tall sparse windows leave more solid wall between the
 * openings, and solid wall is what a crumble line is *drawn on*: a dense band
 * of glass gives the survivor courses nothing to be made of.
 */
export function relicFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    case "ruined_cottage":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "ruined_keep":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    // A nave wants height in the surviving gable end.
    case "ruined_church":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "gable" };
    case "collapsed_tower":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "overgrown_villa":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the decay plan                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What a decay pass needs to know, or `null` when it may not run.
 *
 * Wave 5E's `ArcanaPlan`, restated rather than imported: the two waves are
 * separate seams and a shared private helper is a shared edit. The refusal is
 * the same one — a **plain rect** footprint only.
 */
interface RelicPlan {
  readonly sx: number;
  readonly sz: number;
  /** Y of the eave plate: the highest course a wall column can survive to. */
  readonly wallTop: number;
  /** Highest Y anything may occupy. */
  readonly top: number;
  readonly rect: LocalRect;
}

/** The plan, or `null` when the footprint is not the plain rect decay needs. */
function relicPlan(ctx: FitOutContext): RelicPlan | null {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) return null;
  if (ctx.wallTop < 3) return null;
  return {
    sx,
    sz,
    wallTop: ctx.wallTop,
    top: ctx.roofTop + ROOF_FLOURISH_RISE,
    rect: { x0: 0, z0: 0, x1: sx - 1, z1: sz - 1 },
  };
}

/** The footprint perimeter of a rect plan, in canonical (z, x) order. */
function ringOf(sx: number, sz: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      if (x === 0 || x === sx - 1 || z === 0 || z === sz - 1) out.push({ x, z });
    }
  }
  return out;
}

/** True when a ring cell is one of the four corners of the footprint. */
function isCorner(plan: RelicPlan, x: number, z: number): boolean {
  return (x === 0 || x === plan.sx - 1) && (z === 0 || z === plan.sz - 1);
}

/**
 * A stable pseudo-random byte for a cell, with no seed and no draw.
 *
 * **Determinism, the way every archetype file gets it.** A fit-out has no RNG
 * stream of its own — `FitOutContext` carries none, by design, because the
 * whole grammar is a pure function of the envelope. The variation a crumble
 * line needs is therefore *positional*: an integer hash of the cell, mixed
 * with a per-archetype salt so two ruins on the same plan do not crumble
 * identically. Same envelope in, same wall out, forever; no wall clock, no
 * `Math.random`, and no transcendentals.
 */
function cellHash(salt: number, x: number, z: number): number {
  let h = (x * 0x1f1f1f + z * 0x2c1b3c + salt * 0x9e3779b1) | 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491) | 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** A per-archetype salt, so two ruins of different kinds crumble differently. */
function saltOf(archetype: string): number {
  let h = 0;
  for (let i = 0; i < archetype.length; i++) h = (Math.imul(h, 31) + archetype.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** How a ruin's wall heads are shaped — the character of its collapse. */
interface CrumbleStyle {
  /** Lowest course a wall column may survive to; never below 1. */
  readonly floor: number;
  /** The spread of surviving heights above {@link CrumbleStyle.floor}. */
  readonly spread: number;
  /** Corners survive to the eave plate: a keep's stumps, a tower's stack. */
  readonly cornersStand: boolean;
  /**
   * A directional lean: the wall furthest along `+x` loses this many extra
   * courses, so the ruin reads as having fallen **one way** rather than as
   * having been nibbled evenly. Zero for an even collapse.
   */
  readonly lean: number;
}

/**
 * The course a ring column survives to.
 *
 * Never below 1 — a wall that is gone entirely at ground level is a doorway
 * where nobody put one, and the shell's own floor plane is what a ruin still
 * stands on. Never above the eave plate, because the eave plate is where the
 * shell stopped building wall.
 */
function crumbleHeight(
  ctx: FitOutContext,
  plan: RelicPlan,
  style: CrumbleStyle,
  x: number,
  z: number,
): number {
  if (protectedColumn(ctx, x, z)) return plan.wallTop;
  if (style.cornersStand && isCorner(plan, x, z)) return plan.wallTop;
  const salt = saltOf(ctx.archetype);
  const spread = Math.max(1, Math.min(style.spread, plan.wallTop));
  let h = style.floor + (cellHash(salt, x, z) % spread);
  if (style.lean > 0 && plan.sx > 2) {
    // The fall direction: linear in x, so the wall head slopes rather than
    // stepping at random, which is what makes a collapse read as one event.
    h -= Math.floor((style.lean * x) / (plan.sx - 1));
  }
  if (h < 1) h = 1;
  if (h > plan.wallTop) h = plan.wallTop;
  return h;
}

/**
 * The cell a player stands in to open the door, or `null` when there is none.
 */
function outsideDoor(ctx: FitOutContext): { readonly x: number; readonly z: number } | null {
  if (ctx.door === null) return null;
  const [dx, dz] = cardinalStep(ctx.door.face);
  return { x: ctx.door.x + dx, z: ctx.door.z + dz };
}

/** The interior cell immediately inside the door — where the walk starts. */
function insideDoor(ctx: FitOutContext): { readonly x: number; readonly z: number } | null {
  if (ctx.door === null) return null;
  const [dx, dz] = cardinalStep(ctx.door.face);
  return { x: ctx.door.x - dx, z: ctx.door.z - dz };
}

/**
 * **The way in is not decayed.** True for the door column, the doorstep
 * outside it and the cell inside it.
 *
 * Every one of the five moves consults this. The door is where the walking
 * agent starts and where the lint's traversal walk starts; a ruin whose door
 * has crumbled into a heap is a ruin nobody can be put inside.
 */
function protectedColumn(ctx: FitOutContext, x: number, z: number): boolean {
  if (ctx.door === null) return false;
  if (x === ctx.door.x && z === ctx.door.z) return true;
  const out = outsideDoor(ctx);
  if (out !== null && out.x === x && out.z === z) return true;
  const inn = insideDoor(ctx);
  return inn !== null && inn.x === x && inn.z === z;
}

/**
 * Blocks a re-clad may never overwrite — wave 5E's list, minus the fire.
 *
 * A ruin has no campfire and no lantern of its own; what it must not eat is
 * the door and the ladder, because both are the routes the walk uses.
 */
const PRESERVE = /(_door$|^ladder$)/;

/* -------------------------------------------------------------------------- */
/* the five moves                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Move 1 and 2: draw the crumble line, clear above it **from the top down**,
 * and re-clad what is left.
 *
 * Returns the surviving height of every ring column, keyed `"x,z"`, which is
 * what {@link breakRoof} needs to know where a fragment may rest.
 */
function crumbleWalls(
  ctx: FitOutContext,
  c: PropCounter,
  plan: RelicPlan,
  style: CrumbleStyle,
  clad: (x: number, y: number, z: number) => string,
): Map<string, number> {
  const heads = new Map<string, number>();
  for (const cell of ringOf(plan.sx, plan.sz)) {
    const h = crumbleHeight(ctx, plan, style, cell.x, cell.z);
    heads.set(`${cell.x},${cell.z}`, h);
    // Clear from the top of the envelope DOWN to the survivor. A whole run, so
    // nothing is ever left with air above it and air below it.
    if (!protectedColumn(ctx, cell.x, cell.z)) {
      // Clearing is not building: an air write is not counted, exactly as
      // wave 5E's `clearRoof` does not count the roof it removes.
      for (let y = plan.top + 2; y > h; y--) ctx.put(cell.x, y, cell.z, "air");
    }
    // Re-clad the survivors. `y = 1` is the standing course and holds the
    // door frame, so the re-clad starts at 2 and the shell's own plinth stays.
    for (let y = 2; y <= h; y++) {
      const standing = ctx.blockAt(cell.x, y, cell.z);
      if (standing !== undefined && PRESERVE.test(standing.block)) continue;
      if (protectedColumn(ctx, cell.x, cell.z)) continue;
      ctx.put(cell.x, y, cell.z, clad(cell.x, y, cell.z));
      c.n++;
    }
  }
  return heads;
}

/**
 * Move 3: the roof, broken to fragments that never float.
 *
 * Everything above the eave plate is cleared — footprint **and** apron, so no
 * eave course is left hanging off a wall that is no longer there — and then a
 * fragment is written on the head of each ring column that survived all the
 * way to the plate. A fragment therefore always has the wall it rests on
 * directly under it, which is the `floating.slab` / `floating.isolated` rule
 * satisfied by construction rather than by inspection.
 *
 * There is no fragment anywhere over the room. A rafter spanning a room is a
 * run of blocks whose only support is at its two ends, and the middle of that
 * run is a full cube with six air faces.
 */
function breakRoof(
  ctx: FitOutContext,
  c: PropCounter,
  plan: RelicPlan,
  heads: Map<string, number>,
  fragment: string,
): void {
  for (let y = plan.wallTop + 1; y <= plan.top + 2; y++) {
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) {
        if (protectedColumn(ctx, x, z)) continue;
        ctx.put(x, y, z, "air");
      }
    }
  }
  const salt = saltOf(ctx.archetype);
  for (const cell of ringOf(plan.sx, plan.sz)) {
    if (heads.get(`${cell.x},${cell.z}`) !== plan.wallTop) continue;
    if (protectedColumn(ctx, cell.x, cell.z)) continue;
    // Two thirds of the surviving heads keep a piece of the roof; the rest are
    // bare. A ruin with a fragment on every wall head is a crenellation.
    if (cellHash(salt + 7, cell.x, cell.z) % 3 === 0) continue;
    ctx.put(cell.x, plan.wallTop + 1, cell.z, fragment, {
      type: "bottom",
      waterlogged: "false",
    });
    c.n++;
  }
}

/**
 * Move 4: rubble.
 *
 * Full blocks at `y = 1`, laid through {@link PropCounter.put1} so the ground
 * floor's own `take` decides whether a heap may stand where it wants to — a
 * heap that would strand a cell is simply refused. Cells on the way in are
 * skipped outright, and the middle column the shell hangs its lantern in is
 * left alone for the same reason every wave leaves it alone.
 *
 * A share of the heaps take a moss carpet on top. The carpet is in the lint's
 * `NEEDS_GROUND` set: it is written at `y = 2`, on the heap, and nowhere else.
 */
function rubble(
  ctx: FitOutContext,
  c: PropCounter,
  density: number,
  heap: (x: number, z: number) => string,
): number {
  const it = ctx.interior;
  const salt = saltOf(ctx.archetype);
  const lampX = Math.floor((it.x0 + it.x1) / 2);
  const lampZ = Math.floor((it.z0 + it.z1) / 2);
  let laid = 0;
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (protectedColumn(ctx, x, z)) continue;
      if (x === lampX && z === lampZ) continue;
      if (cellHash(salt + 19, x, z) % 100 >= density) continue;
      if (!c.put1(x, z, heap(x, z))) continue;
      laid++;
      // Moss on the top of the heap — the one place a carpet has ground.
      if (cellHash(salt + 23, x, z) % 3 === 0) c.stack(x, z, 2, "moss_carpet");
    }
  }
  return laid;
}

/**
 * Move 5: the green.
 *
 * A `vine` hung on the **inside face** of a surviving wall, with the face
 * property naming the wall it holds on to. The block is in the pinned 1.21.11
 * table (checked against `minecraft-data`, not assumed), it is passable, and
 * the lint polices no support rule for it — but a vine with no face set at all
 * renders as nothing, which is the `flower_pot` lesson in another costume, so
 * every one here names its wall.
 */
function vines(ctx: FitOutContext, c: PropCounter, plan: RelicPlan, share: number): number {
  const it = ctx.interior;
  const salt = saltOf(ctx.archetype);
  let n = 0;
  /** Which wall a wall-row interior cell has behind it, and the vine's face. */
  const faces: readonly (readonly [number, number, string])[] = [
    [-1, 0, "west"],
    [1, 0, "east"],
    [0, -1, "north"],
    [0, 1, "south"],
  ];
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (protectedColumn(ctx, x, z)) continue;
      for (const [dx, dz, face] of faces) {
        const wx = x + dx;
        const wz = z + dz;
        if (wx > 0 && wx < plan.sx - 1 && wz > 0 && wz < plan.sz - 1) continue; // not a wall
        const wall = ctx.blockAt(wx, 2, wz);
        if (wall === undefined || wall.block === "air") continue;
        if (cellHash(salt + 31, x * 7 + wx, z * 11 + wz) % 100 >= share) continue;
        if (ctx.blockAt(x, 2, z) !== undefined) continue;
        ctx.put(x, 2, z, "vine", {
          north: face === "north" ? "true" : "false",
          south: face === "south" ? "true" : "false",
          east: face === "east" ? "true" : "false",
          west: face === "west" ? "true" : "false",
          up: "false",
        });
        c.n++;
        n++;
        break;
      }
    }
  }
  return n;
}

/**
 * A grounded spill in the apron: rubble that has fallen *out* of the building.
 *
 * The apron-post ground rule, in the form a ruin needs it. On conformed
 * terrain the apron ground fills local `y = 0`; on a platform it sits one
 * lower. A spill block is written at `y = 1` only when there is something at
 * `y = 0` under it, and skipped otherwise — a heap of cobble hanging one block
 * off the ground is the same defect as a floating brazier.
 */
function spill(ctx: FitOutContext, c: PropCounter, plan: RelicPlan, block: string): number {
  const salt = saltOf(ctx.archetype);
  let n = 0;
  for (let z = -1; z <= plan.sz; z++) {
    for (let x = -1; x <= plan.sx; x++) {
      if (x !== -1 && x !== plan.sx && z !== -1 && z !== plan.sz) continue;
      if (protectedColumn(ctx, x, z)) continue;
      if (cellHash(salt + 41, x, z) % 5 !== 0) continue;
      // The apron-ground rule, in the form a spill needs it. On conformed
      // terrain the apron fills local `y = 0` and the heap stands on it at
      // `y = 1`; on a platform there is nothing there at all, and a heap
      // written at `y = 1` would hang one block off the ground — so the heap
      // *becomes* the ground and is written flush at `y = 0` instead. Either
      // way the block below it is solid.
      const y = ctx.blockAt(x, 0, z) === undefined ? 0 : 1;
      if (ctx.blockAt(x, y, z) !== undefined) continue;
      ctx.put(x, y, z, block);
      c.n++;
      n++;
    }
  }
  return n;
}

/** Paint the floor plane — a recolour, which costs no cell and blocks nothing. */
function floorPaint(
  ctx: FitOutContext,
  c: PropCounter,
  rect: LocalRect,
  block: (x: number, z: number) => string | null,
): void {
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const b = block(x, z);
      if (b === null) continue;
      ctx.put(x, 0, z, b);
      c.n++;
    }
  }
}

/**
 * Offer a prop every cell of the two wall rows in turn, and stop at the first
 * that takes it — wave 5E's helper, verbatim.
 */
function offerOnWalls(
  ctx: FitOutContext,
  c: PropCounter,
  block: string,
  props?: Record<string, string>,
): boolean {
  const it = ctx.interior;
  for (let z = it.z0; z <= it.z1; z++) {
    for (const x of [it.x1, it.x0]) {
      if (protectedColumn(ctx, x, z)) continue;
      if (c.put1(x, z, block, props)) return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this file's archetypes.
 *
 * Returns the number of blocks written, which `furnish` adds to its own count.
 * Zero, and not one cell touched, for anything that is not ours.
 */
export function furnishRelic(ctx: FitOutContext): number {
  if (!isRelicArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "ruined_cottage":
      fitRuinedCottage(ctx, c);
      break;
    case "ruined_keep":
      fitRuinedKeep(ctx, c);
      break;
    case "ruined_church":
      fitRuinedChurch(ctx, c);
      break;
    case "collapsed_tower":
      fitCollapsedTower(ctx, c);
      break;
    case "overgrown_villa":
    default:
      fitOvergrownVilla(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the five ruins                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `ruined_cottage` — a small house nobody has lived in for a long time.
 *
 * The gentlest of the five and the reference implementation of the ruin law:
 * an even crumble a course or two above the standing plane, mossy cobble
 * survivors, the thatch gone entirely with a fragment or two left on the wall
 * heads, a scatter of rubble on the floor and vines down the inside of what is
 * left. A hearth-side barrel and a broken chair — a stair with its back to the
 * room — are the only furniture, because a cottage that still has its dresser
 * in it has not been abandoned.
 */
function fitRuinedCottage(ctx: FitOutContext, c: PropCounter): void {
  const plan = relicPlan(ctx);
  if (plan !== null) {
    const heads = crumbleWalls(
      ctx,
      c,
      plan,
      { floor: 2, spread: 3, cornersStand: false, lean: 0 },
      (x, y, z) => (cellHash(3, x + y, z) % 3 === 0 ? "mossy_cobblestone" : "cobblestone"),
    );
    breakRoof(ctx, c, plan, heads, ctx.style["roof.slab"] as string);
    spill(ctx, c, plan, "mossy_cobblestone");
    vines(ctx, c, plan, 35);
  }
  floorPaint(ctx, c, ctx.interior, (x, z) =>
    cellHash(5, x, z) % 4 === 0 ? "coarse_dirt" : null,
  );
  rubble(ctx, c, 26, (x, z) => (cellHash(11, x, z) % 2 === 0 ? "mossy_cobblestone" : "cobblestone"));
  offerOnWalls(ctx, c, "barrel", { facing: "up", open: "false" });
  offerOnWalls(ctx, c, ctx.style["stair.interior"] as string, {
    facing: "north",
    half: "bottom",
    shape: "straight",
  });
}

/**
 * `ruined_keep` — a fortress reduced to its corners.
 *
 * The one collapse in this file that is *structured*: the corners stand,
 * because a keep's corners are its thickest masonry and are the last thing to
 * go, and the curtains between them are gone almost to the plinth. The read is
 * four stumps and a low wall, which is what a real keep ruin looks like from
 * across a field.
 *
 * Cracked and mossy stone brick in the survivors, a heavier rubble field than
 * the cottage's, and an apron spill of cobbled deepslate outside the walls.
 */
function fitRuinedKeep(ctx: FitOutContext, c: PropCounter): void {
  const plan = relicPlan(ctx);
  if (plan !== null) {
    const heads = crumbleWalls(
      ctx,
      c,
      plan,
      { floor: 2, spread: 3, cornersStand: true, lean: 0 },
      (x, y, z) => {
        const k = cellHash(13, x + y * 3, z) % 5;
        if (k === 0) return "cracked_stone_bricks";
        if (k === 1) return "mossy_stone_bricks";
        return "stone_bricks";
      },
    );
    breakRoof(ctx, c, plan, heads, ctx.style["stone.slab"] as string);
    spill(ctx, c, plan, "cobbled_deepslate");
    vines(ctx, c, plan, 25);
  }
  floorPaint(ctx, c, ctx.interior, (x, z) =>
    cellHash(17, x, z) % 5 === 0 ? "cracked_stone_bricks" : null,
  );
  rubble(ctx, c, 30, (x, z) =>
    cellHash(19, x, z) % 3 === 0 ? "mossy_stone_bricks" : "cobblestone",
  );
  offerOnWalls(ctx, c, "cobweb");
  offerOnWalls(ctx, c, ctx.style["stone.slab"] as string, {
    type: "bottom",
    waterlogged: "false",
  });
}

/**
 * `ruined_church` — a roofless nave with one gable end still up.
 *
 * The crumble is even but generous, so the walls stay tall enough to read as a
 * nave; what makes it a *church* ruin rather than a barn ruin is the survivor
 * cladding — mossy stone brick with a chiseled band — and the altar stump at
 * the end furthest from the door, which is one block of chiseled stone brick
 * with a slab on it and nothing else. No candles: this altar has been cold for
 * a century.
 */
function fitRuinedChurch(ctx: FitOutContext, c: PropCounter): void {
  const plan = relicPlan(ctx);
  if (plan !== null) {
    const heads = crumbleWalls(
      ctx,
      c,
      plan,
      { floor: 3, spread: 3, cornersStand: true, lean: 0 },
      (x, y, z) => {
        if (y === 3) return "chiseled_stone_bricks";
        return cellHash(23, x, y + z) % 3 === 0 ? "mossy_stone_bricks" : "stone_bricks";
      },
    );
    breakRoof(ctx, c, plan, heads, ctx.style["stone.slab"] as string);
    spill(ctx, c, plan, "mossy_stone_bricks");
    vines(ctx, c, plan, 40);
  }
  const it = ctx.interior;
  floorPaint(ctx, c, it, (x, z) => (cellHash(29, x, z) % 6 === 0 ? "podzol" : null));
  rubble(ctx, c, 22, (x, z) =>
    cellHash(31, x, z) % 2 === 0 ? "mossy_stone_bricks" : "cobblestone",
  );
  // The altar stump, at the far end and one column off the middle — the shell
  // hangs its lantern in the middle column and nothing here stands under it.
  const far = ctx.door !== null && ctx.door.z > (it.z0 + it.z1) / 2 ? it.z0 : it.z1;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  for (const x of [mid - 1, mid + 1, it.x0, it.x1]) {
    if (x < it.x0 || x > it.x1) continue;
    if (protectedColumn(ctx, x, far)) continue;
    if (c.put1(x, far, "chiseled_stone_bricks")) {
      c.stack(x, far, 2, ctx.style["stone.slab"] as string, {
        type: "bottom",
        waterlogged: "false",
      });
      break;
    }
  }
}

/**
 * `collapsed_tower` — a tower that has fallen **one way**.
 *
 * The only leaning collapse here, and the reason {@link CrumbleStyle.lean}
 * exists: the surviving height falls off linearly along `+x`, so the wall head
 * slopes from a standing stub at one end to almost nothing at the other. That
 * is what a tower that went over looks like, and it is a very different read
 * from the even nibble the cottage gets.
 *
 * Everything the tower shed is on the ground: a heavy rubble field inside and
 * a heavy grounded spill in the apron on the side it fell towards.
 */
function fitCollapsedTower(ctx: FitOutContext, c: PropCounter): void {
  const plan = relicPlan(ctx);
  if (plan !== null) {
    const heads = crumbleWalls(
      ctx,
      c,
      plan,
      { floor: 2, spread: 3, cornersStand: false, lean: Math.max(2, plan.wallTop - 2) },
      (x, y, z) => {
        const k = cellHash(37, x, y + z) % 4;
        if (k === 0) return "cracked_stone_bricks";
        if (k === 1) return "mossy_cobblestone";
        return "stone_bricks";
      },
    );
    breakRoof(ctx, c, plan, heads, ctx.style["stone.slab"] as string);
    spill(ctx, c, plan, "cobblestone");
    vines(ctx, c, plan, 20);
  }
  floorPaint(ctx, c, ctx.interior, (x, z) =>
    cellHash(41, x, z) % 3 === 0 ? "gravel" : null,
  );
  rubble(ctx, c, 34, (x, z) => (cellHash(43, x, z) % 3 === 0 ? "cracked_stone_bricks" : "cobblestone"));
  offerOnWalls(ctx, c, "cobweb");
}

/**
 * `overgrown_villa` — a fine house the forest has taken back.
 *
 * The gentlest crumble of the five (the walls are mostly *there*; it is the
 * roof that has gone) and by far the greenest: moss block among the survivors,
 * vines on every second inside face, moss carpet on most of the rubble and a
 * floor gone half to grass. The one piece of the villa still legible is a row
 * of **fallen column drums** — full blocks lying in a line along a wall row,
 * each touching its neighbour and the floor under it, which is what keeps the
 * run out of `floating.isolated`.
 */
function fitOvergrownVilla(ctx: FitOutContext, c: PropCounter): void {
  const plan = relicPlan(ctx);
  if (plan !== null) {
    const heads = crumbleWalls(
      ctx,
      c,
      plan,
      { floor: 3, spread: 2, cornersStand: true, lean: 0 },
      (x, y, z) => {
        const k = cellHash(47, x + y, z) % 6;
        if (k === 0) return "moss_block";
        if (k === 1) return "mossy_stone_bricks";
        return "smooth_sandstone";
      },
    );
    breakRoof(ctx, c, plan, heads, ctx.style["stone.slab"] as string);
    spill(ctx, c, plan, "moss_block");
    vines(ctx, c, plan, 55);
  }
  const it = ctx.interior;
  floorPaint(ctx, c, it, (x, z) => (cellHash(53, x, z) % 3 === 0 ? "grass_block" : null));
  rubble(ctx, c, 20, (x, z) => (cellHash(59, x, z) % 2 === 0 ? "moss_block" : "cobblestone"));
  // The fallen colonnade: a run of drums down one wall row, laid end to end so
  // every drum touches the one beside it and the floor beneath it.
  // Offered every cell of both wall rows in turn rather than laid blindly down
  // one: a cell taken by the stair run, the hearth reserve or the door
  // approach is a cell `put1` refuses, and a villa with no colonnade in it is
  // not the archetype. A refusal is skipped, never a reason to stop.
  let drums = 0;
  for (const row of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (protectedColumn(ctx, row, z)) continue;
      if (c.put1(row, z, "chiseled_sandstone")) drums++;
    }
    if (drums > 0) break;
  }
}
