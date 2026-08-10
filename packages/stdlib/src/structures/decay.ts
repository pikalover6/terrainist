/**
 * **The decay engine** — RUINS-PLAN-v0 §3.1, WP-1.
 *
 * ## THE RUIN LAW
 *
 * **A ruined building is the ordinary shell fit-out DECAYED, not a second
 * grammar.** There is no ruin builder: the same shell is built, and then
 * written over.
 *
 * Wave 6E made that sentence true of five archetypes by hand-writing five move
 * sequences inside `archetypes-relic.ts`. This file is the same five moves
 * lifted into **operators over a finished shell**, so that the five relics
 * become five `DecayProfile` parameter sets rather than five implementations.
 * Nothing else changed: WP-1's whole acceptance bar is **list-identity** —
 * every relic emits the op list it emitted before, element for element, order
 * and duplicates included (`test/relic-decay-identity.test.ts`).
 *
 * ## The order, which is load-bearing
 *
 * `decayShell` runs the operators in exactly the order the five moves already
 * ran in, because the order is what keeps blocks from floating and what keeps
 * the emitted list identical:
 *
 * 1. **`crumbleWalls`** — the crumble line per ring column, cleared **from the
 *    top down** in whole runs, survivors re-clad. A whole run, so nothing is
 *    ever left with air above it and air below it: a punched hole is exactly
 *    how a full cube ends up with six air faces (`floating.isolated`).
 * 2. **`breakRoof`** — everything above the eave plate cleared, footprint and
 *    apron, then a fragment laid **only** on a ring column that survived to the
 *    plate. Nothing is ever laid over the room: a rafter spanning a room is a
 *    run supported at its two ends whose middle floats.
 * 3. *(optional)* **the upper storeys go**, for a shell whose deck no ladder
 *    can reach any more ({@link DecayProfile.clearInteriorFrom}).
 * 4. **`spill`** — grounded heaps in the apron ring.
 * 5. **`green`** — vines on the inside faces of survivors.
 * 6. **`floorPaint`** — the floor plane recoloured. Costs no cell.
 * 7. **`rubble`** — full blocks on the floor plane, every one through
 *    {@link PropCounter.put1} so the ground floor's own reservation decides
 *    whether a heap may stand where it wants to. Moss carpet on heap tops only
 *    (a carpet is in the lint's `NEEDS_GROUND` set).
 *
 * **NOTE for WP-2.** RUINS-PLAN §3.1's operator table lists `rubble` *before*
 * `spill` and `green`. The shipped code has always run `spill` and `green`
 * before `rubble`, and list-identity is the WP-1 bar, so the shipped order is
 * what this file preserves. §3.1's table is the document's error, not the
 * code's — the ordering constraint that actually matters is that every
 * *removal* precedes every *addition* that stands on what survived.
 *
 * ## What decay may never touch
 *
 * - **the door, and the approach to it.** {@link protectedColumn} keeps the
 *   door column, the doorstep outside it and the cell inside it out of every
 *   operator — the walking agent and the lint's traversal walk both start in
 *   the cell inside the door;
 * - **the interior's reachability.** Rubble goes through `put1`/`take`, which
 *   refuses any placement that would strand a cell. (WP-2's `reachOrRefuse`
 *   turns that construction into a check.)
 *
 * ## Not yet here, deliberately
 *
 * `quench`, `settleFixtures`, `reachOrRefuse`, the `WEATHERED_VARIANTS` re-clad
 * rule, the collapse-by-category table and the band table are **WP-2 and WP-3**
 * (RUINS-PLAN §5, §6). WP-1 changes nothing at all, by design: it is the
 * extraction and its proof. {@link DecayProfile.intensity} and
 * {@link DecayProfile.mode} are carried now because they are the profile's
 * shape and the five relics' values for them are recorded data (§5's table);
 * no operator reads them yet.
 */

import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
} from "./archetypes-civic.js";
import { cardinalStep, type Cardinal, type LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the profile                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The materials a decay writes with.
 *
 * **THE RE-CLAD RULE** (RUINS-PLAN §5.2) says a re-clad never invents a
 * material: it substitutes within the block's own family, and where the family
 * has no weathered variant the decay takes the block away instead. Deriving
 * these from the shell's own materials is **WP-2**; in WP-1 each relic states
 * them, which is exactly what it stated before.
 */
export interface DecayMaterials {
  /** The survivor cladding for a ring column at `(x, y, z)`. */
  readonly clad: (x: number, y: number, z: number) => string;
  /** Style key of the slab a roof fragment is made of — e.g. `"stone.slab"`. */
  readonly fragmentStyle: string;
  /** The apron spill block. */
  readonly spill: string;
  /** A rubble heap's block at `(x, z)`. */
  readonly heap: (x: number, z: number) => string;
  /** The floor-plane recolour at `(x, z)`, or `null` to leave it alone. */
  readonly floorPaint: (x: number, z: number) => string | null;
}

/**
 * How far gone a shell is, and in what character.
 *
 * One profile per ruin. WP-3's band table (RUINS-PLAN §6) becomes the single
 * function from `decline` to one of these; WP-1 has five literals.
 */
export interface DecayProfile {
  /**
   * 0..1 — how far gone. RUINS-PLAN §5's table records each relic's value.
   *
   * WP-2/WP-3 drive the other dials from this through the band table; in WP-1
   * it is carried, tested against §5's table, and read by no operator, because
   * a derivation that changed one course of one wall would fail list-identity.
   */
  readonly intensity: number;
  /**
   * How the wall head is shaped (RUINS-PLAN §5.1).
   *
   * - `even` — survivor height is `floor + hash(cell) % spread`. Reads as *time*.
   * - `structured` — the four corners survive to the eave plate and the
   *   curtains between them fall. Reads as *mass*: the thickest masonry goes
   *   last. Correct for quoins, buttresses, corner towers.
   * - `leaning` — a linear lean along `+x`, so the wall head slopes from a
   *   standing stub to nothing. Reads as *one event*: a tower falls over, it
   *   does not weather away.
   */
  readonly collapse: "even" | "structured" | "leaning";
  /** Lowest course a wall column may survive to; never applied below 1. */
  readonly collapseFloor: number;
  /** The spread of surviving heights above {@link DecayProfile.collapseFloor}. */
  readonly collapseSpread: number;
  /** 0..1 — vines on the inside faces of survivors. */
  readonly overgrowth: number;
  /** 0..1 — rubble heaps on the floor plane. */
  readonly rubble: number;
  /**
   * Clear the interior outright from this Y up, before the spill.
   *
   * The collapsed tower's deck: a platform fed by a ladder whose backing wall
   * has just crumbled is a floating disc the walking agent cannot reach. A
   * collapsed tower is a stump, not a treehouse.
   */
  readonly clearInteriorFrom?: number;
  /**
   * `facade` restricts the decay to the façade, for shells whose floors are
   * structural (RUINS-PLAN §5.4). **WP-6**; no operator reads it yet, and the
   * five relics are all `shell`.
   */
  readonly mode?: "shell" | "facade";
  readonly materials: DecayMaterials;
}

/** How a ruin's wall heads are shaped, resolved from {@link DecayProfile}. */
interface CrumbleStyle {
  readonly floor: number;
  readonly spread: number;
  /** Corners survive to the eave plate: a keep's stumps, a tower's stack. */
  readonly cornersStand: boolean;
  /**
   * A directional lean: the wall furthest along `+x` loses this many extra
   * courses. Zero for an even or a structured collapse.
   */
  readonly lean: number;
}

/**
 * The concrete crumble style of a profile on a given shell.
 *
 * The lean is a function of the shell rather than a constant, because a lean
 * that outran the wall would flatten a short tower and leave a tall one
 * standing: `wallTop - 2`, floored at 2, is the value the collapsed tower has
 * always used.
 */
function crumbleStyleOf(profile: DecayProfile, plan: DecayPlan): CrumbleStyle {
  return {
    floor: profile.collapseFloor,
    spread: profile.collapseSpread,
    cornersStand: profile.collapse === "structured",
    lean: profile.collapse === "leaning" ? Math.max(2, plan.wallTop - 2) : 0,
  };
}

/** A 0..1 share as the integer percent the operators draw against. */
function pct(share: number): number {
  return Math.round(share * 100);
}

/* -------------------------------------------------------------------------- */
/* the plan                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What a decay pass needs to know about the shell it is decaying.
 *
 * The refusal is the same one wave 5E's `ArcanaPlan` makes — a **plain rect**
 * footprint only — plus table 14's own: a crumble line drawn on a wall of
 * fewer than three courses has nothing to take away.
 */
export interface DecayPlan {
  readonly sx: number;
  readonly sz: number;
  /** Y of the eave plate: the highest course a wall column can survive to. */
  readonly wallTop: number;
  /** Highest Y anything may occupy. */
  readonly top: number;
  readonly rect: LocalRect;
}

/** The plan, or `null` when the footprint is not the plain rect decay needs. */
export function decayPlan(ctx: FitOutContext): DecayPlan | null {
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
function isCorner(plan: DecayPlan, x: number, z: number): boolean {
  return (x === 0 || x === plan.sx - 1) && (z === 0 || z === plan.sz - 1);
}

/**
 * A stable pseudo-random byte for a cell, with no seed and no draw.
 *
 * **Determinism, the way every archetype file gets it.** A fit-out has no RNG
 * stream of its own — `FitOutContext` carries none, by design, because the
 * whole grammar is a pure function of the envelope. The variation a crumble
 * line needs is therefore *positional*: an integer hash of the cell, mixed
 * with a salt so two ruins on the same plan do not crumble identically. Same
 * envelope in, same wall out, forever; no wall clock, no `Math.random`, and no
 * transcendentals.
 */
export function cellHash(salt: number, x: number, z: number): number {
  let h = (x * 0x1f1f1f + z * 0x2c1b3c + salt * 0x9e3779b1) | 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491) | 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** A per-archetype salt, so two ruins of different kinds crumble differently. */
export function saltOf(archetype: string): number {
  let h = 0;
  for (let i = 0; i < archetype.length; i++) h = (Math.imul(h, 31) + archetype.charCodeAt(i)) | 0;
  return h >>> 0;
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
  plan: DecayPlan,
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

/** The cell a player stands in to open the door, or `null` when there is none. */
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
 * Every operator consults this, and so does every ruin's own furniture. The
 * door is where the walking agent starts and where the lint's traversal walk
 * starts; a ruin whose door has crumbled into a heap is a ruin nobody can be
 * put inside.
 */
export function protectedColumn(ctx: FitOutContext, x: number, z: number): boolean {
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
/* the operators                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Operator 1: draw the crumble line, clear above it **from the top down**, and
 * re-clad what is left.
 *
 * Returns the surviving height of every ring column, keyed `"x,z"`, which is
 * what {@link breakRoof} needs to know where a fragment may rest.
 */
function crumbleWalls(
  ctx: FitOutContext,
  c: PropCounter,
  plan: DecayPlan,
  style: CrumbleStyle,
  clad: (x: number, y: number, z: number) => string,
): Map<string, number> {
  const heads = new Map<string, number>();
  // The wall the stair flight leans on survives with it. A two-storey shell
  // runs its flight up an interior wall row before decay ever gets here, and
  // a step whose flanking wall crumbled is a stair with air on every side —
  // so every ring column beside a flight step keeps at least the step's own
  // height plus a course. Roof stairs sit above the eave plate and are not
  // flight steps, hence the `y <= wallTop` bound.
  const stairMin = new Map<string, number>();
  const it = ctx.interior;
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      for (let y = 1; y <= plan.wallTop; y++) {
        const op = ctx.blockAt(x, y, z);
        if (op === undefined || !op.block.endsWith("_stairs")) continue;
        for (const [nx, nz] of [
          [x - 1, z],
          [x + 1, z],
          [x, z - 1],
          [x, z + 1],
        ] as const) {
          const key = `${nx},${nz}`;
          stairMin.set(key, Math.max(stairMin.get(key) ?? 0, y + 1));
        }
      }
    }
  }
  for (const cell of ringOf(plan.sx, plan.sz)) {
    const floor = stairMin.get(`${cell.x},${cell.z}`) ?? 0;
    const h = Math.max(crumbleHeight(ctx, plan, style, cell.x, cell.z), floor);
    heads.set(`${cell.x},${cell.z}`, h);
    // Clear from the top of the envelope DOWN to the survivor. A whole run, so
    // nothing is ever left with air above it and air below it. The door column
    // is protected only to its lintel: what the walk needs is the doorway, and
    // skipping the whole column left the shell's roof stairs floating above it
    // once everything around them was gone.
    const keep = protectedColumn(ctx, cell.x, cell.z) ? Math.max(h, 3) : h;
    // Clearing is not building: an air write is not counted, exactly as
    // wave 5E's `clearRoof` does not count the roof it removes.
    for (let y = plan.top + 2; y > keep; y--) ctx.put(cell.x, y, cell.z, "air");
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
 * Operator 2: the roof, broken to fragments that never float.
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
  plan: DecayPlan,
  heads: Map<string, number>,
  fragment: string,
): void {
  // No protected-column skip here: everything this loop touches is at roof
  // height, far above the doorway, and skipping the doorstep column left the
  // eave stair hanging over it with air on every side.
  for (let y = plan.wallTop + 1; y <= plan.top + 2; y++) {
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) {
        ctx.put(x, y, z, "air");
      }
    }
  }
  // The eave course itself sits AT the plate, one cell outside the footprint —
  // outside the ring the crumble walks and below the band this loop clears. A
  // wall that crumbled under its own eave left that overhang stair floating,
  // so the plate course is cleared everywhere except the ring, where the
  // surviving wall heads live.
  for (let x = -1; x <= plan.sx; x++) {
    for (let z = -1; z <= plan.sz; z++) {
      const onRing =
        x >= 0 && x < plan.sx && z >= 0 && z < plan.sz &&
        (x === 0 || x === plan.sx - 1 || z === 0 || z === plan.sz - 1);
      if (onRing) continue;
      ctx.put(x, plan.wallTop, z, "air");
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
 * Operator: rubble.
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
 * Operator: the green.
 *
 * A `vine` hung on the **inside face** of a surviving wall, with the face
 * property naming the wall it holds on to. The block is in the pinned 1.21.11
 * table (checked against `minecraft-data`, not assumed), it is passable, and
 * the lint polices no support rule for it — but a vine with no face set at all
 * renders as nothing, which is the `flower_pot` lesson in another costume, so
 * every one here names its wall.
 *
 * Moss is the one move that *is* allowed to introduce a foreign block, because
 * moss is not the building's material: it is what is growing on it.
 */
function green(ctx: FitOutContext, c: PropCounter, plan: DecayPlan, share: number): number {
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
 * Operator: a grounded spill in the apron — rubble that has fallen *out* of
 * the building.
 *
 * The apron-post ground rule, in the form a ruin needs it. On conformed
 * terrain the apron ground fills local `y = 0`; on a platform it sits one
 * lower. A spill block is written at `y = 1` only when there is something at
 * `y = 0` under it, and flush at `y = 0` otherwise — a heap of cobble hanging
 * one block off the ground is the same defect as a floating brazier.
 */
function spill(ctx: FitOutContext, c: PropCounter, plan: DecayPlan, block: string): number {
  const salt = saltOf(ctx.archetype);
  let n = 0;
  for (let z = -1; z <= plan.sz; z++) {
    for (let x = -1; x <= plan.sx; x++) {
      if (x !== -1 && x !== plan.sx && z !== -1 && z !== plan.sz) continue;
      if (protectedColumn(ctx, x, z)) continue;
      if (cellHash(salt + 41, x, z) % 5 !== 0) continue;
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

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * **Decay a finished shell in place.** Runs AFTER every `furnish*` pass.
 *
 * Returns the number of blocks written *by the decay*, which the caller's own
 * {@link PropCounter} has already accumulated — the return is the same number
 * for a caller that wants it without reaching into `c`.
 *
 * The plan refusal (a non-rect footprint, or a wall of fewer than three
 * courses) skips the shell-shaped operators and still runs the floor paint and
 * the rubble, exactly as the five hand-written sequences did: a shell too small
 * to crumble is still a shell nobody has swept in a century.
 */
export function decayShell(ctx: FitOutContext, c: PropCounter, profile: DecayProfile): number {
  const before = c.n;
  const m = profile.materials;
  const plan = decayPlan(ctx);
  if (plan !== null) {
    const heads = crumbleWalls(ctx, c, plan, crumbleStyleOf(profile, plan), m.clad);
    breakRoof(ctx, c, plan, heads, ctx.style[m.fragmentStyle] as string);
    if (profile.clearInteriorFrom !== undefined) {
      const it = ctx.interior;
      for (let z = it.z0; z <= it.z1; z++) {
        for (let x = it.x0; x <= it.x1; x++) {
          for (let y = profile.clearInteriorFrom; y <= plan.top + 2; y++) ctx.put(x, y, z, "air");
        }
      }
    }
    spill(ctx, c, plan, m.spill);
    green(ctx, c, plan, pct(profile.overgrowth));
  }
  floorPaint(ctx, c, ctx.interior, m.floorPaint);
  rubble(ctx, c, pct(profile.rubble), m.heap);
  return c.n - before;
}

/* -------------------------------------------------------------------------- */
/* the post-guards                                                             */
/* -------------------------------------------------------------------------- */

/**
 * **Nothing the decay unsupported may survive it.** Run after the decay and
 * after the ruin's own furniture.
 *
 * Today this is the two guards wave 6E wrote by hand, because the cottage had
 * exactly two ways to leave something hanging: a ladder rung whose backing
 * wall crumbled, and a hanging lantern whose ceiling went. They live behind
 * **one** entry point on purpose — RUINS-PLAN §5.6 replaces this body with the
 * `settleFixtures` fixpoint (sweep every remaining op, delete any whose
 * support is gone, repeat until nothing is deleted, using the physics lint's
 * own support predicate), and two mechanisms for one invariant is how
 * `CURB_LEVEL_TOLERANCE` happened. There must never be a second guard beside
 * this function; there must only ever be a better body inside it.
 */
export function settleDecayedFixtures(ctx: FitOutContext): void {
  const plan = decayPlan(ctx);
  if (plan === null) return;
  const it = ctx.interior;
  // A ladder stands on the wall face behind it, rung by rung, and the crumble
  // never touches interior cells — so a tower whose west wall fell to a stub
  // was left with six rungs of ladder climbing air.
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      for (let y = 2; y <= plan.top + 2; y++) {
        const op = ctx.blockAt(x, y, z);
        if (op === undefined || op.block !== "ladder") continue;
        const facing = op.props?.["facing"];
        if (facing === undefined) continue;
        // A ladder's `facing` points at the climber, away from the wall it
        // hangs on; the backing block is one step the other way.
        const [dx, dz] = cardinalStep(facing as Cardinal);
        const back = ctx.blockAt(x - dx, y, z - dz);
        if (back === undefined || back.block === "air") ctx.put(x, y, z, "air");
      }
    }
  }
  // A ruin has no lantern. The shell hangs one from the ceiling before decay
  // runs, and the decay takes the ceiling — leaving a lit lamp dangling from
  // open sky, which is both the `unsupported.lantern` finding and a building
  // that reads inhabited.
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      for (let y = 1; y <= plan.top + 2; y++) {
        const op = ctx.blockAt(x, y, z);
        if (op === undefined || op.block !== "lantern") continue;
        if (op.props?.["hanging"] !== "true") continue;
        const above = ctx.blockAt(x, y + 1, z);
        if (above === undefined || above.block === "air") ctx.put(x, y, z, "air");
      }
    }
  }
}
