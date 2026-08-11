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
 * ## WP-2 — the general case
 *
 * WP-1 made the five relics five parameter sets. WP-2 makes the engine take an
 * **arbitrary** shell: {@link WEATHERED_VARIANTS} and the re-clad rule (§5.2),
 * timber by removal, {@link quench} (§5.5), the {@link settleDecayedFixtures}
 * fixpoint (§5.6), {@link reachOrRefuse} (§5.7), {@link collapseForShell}
 * (§5.1) and {@link decayProfileFor}, which is where `params.decay` lands.
 *
 * **None of it moves a relic.** The general moves are dials
 * ({@link DecayProfile.quench}, {@link DecayProfile.timberByRemoval}) that the
 * general profile constructor sets and the five literals leave absent, and the
 * derived materials are only consulted by a profile that did not state its own.
 * WP-1's list-identity golden is still the bar and still passes unchanged.
 *
 * ## Not yet here, deliberately
 *
 * The **band table** (§6) and the **per-lot roll** (§4) are WP-3;
 * {@link DecayProfile.intensity} is now read by {@link decayProfileFor} but the
 * one function from `decline` to a profile is still to come.
 * {@link DecayProfile.mode}`: "facade"` is **WP-6** and no operator reads it.
 */

import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
} from "./archetypes-civic.js";
import { STRUCTURE_CATALOG } from "./catalog.js";
import { cardinalStep, type Cardinal, type LocalRect } from "./core.js";
import { bodyFits, canSupport, supportDirection } from "./support.js";

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
  /**
   * The survivor cladding for a ring column at `(x, y, z)`, or `null` to leave
   * the block that is standing there alone.
   *
   * **THE RE-CLAD RULE, in the type.** `null` is the second clause: a family
   * with no weathered variant is not re-clad at all — the timber, the concrete
   * and the quartz keep their own block and the crumble line simply runs lower
   * on them (WP-2, {@link TIMBER_EXTRA}). The five relics never return it,
   * which is why their output cannot move.
   */
  readonly clad: (x: number, y: number, z: number) => string | null;
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
  /**
   * **WP-2.** Run {@link quench} before the crumble: fire out, fluids out,
   * crops to dead bush. Absent means `false`.
   *
   * Explicit rather than implied, and the five relics leave it absent. A ruin
   * is cold and dry by law, and the relics *are* cold and dry by construction —
   * the five ruined shells put no fire and no water in themselves. `quench` is
   * the cost of the **general** case (a smithy has a forge, a bathhouse a pool,
   * a greenhouse farmland), and turning it on for the relics too would rewrite
   * their hanging lantern and move a list WP-1 pinned. So it is a dial the
   * general profile constructor sets and the five literals do not.
   */
  readonly quench?: boolean;
  /**
   * **WP-2.** Timber decays by removal: a survivor course whose block has no
   * weathered variant loses {@link TIMBER_EXTRA} of the wall instead of being
   * re-clad in something the building is not made of. Absent means `false`.
   *
   * Absent on the five relics for the same reason as {@link quench}: each of
   * them states its own cladding, every one of which *is* a weathered variant
   * of its own family, so the rule would change nothing except by moving the
   * crumble line — which is the list WP-1 pinned.
   */
  readonly timberByRemoval?: boolean;
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
/* WP-2: the re-clad rule                                                      */
/* -------------------------------------------------------------------------- */

/**
 * **THE RE-CLAD RULE** (RUINS-PLAN §5.2).
 *
 * > A re-clad never invents a material. It substitutes within the block's own
 * > family, and where the family has no weathered variant, the decay takes the
 * > block away instead.
 *
 * This is the real generalisation work of WP-2. Today's cottage re-clads its
 * survivors in mossy cobblestone because a cottage is made of cobblestone; a
 * concrete tower re-clad in mossy cobblestone is not a ruin, it is a bug.
 *
 * The table is small, explicit and over the **pinned 1.21.11 set** — every id
 * below was checked against `minecraft-data`, never assumed, exactly as the
 * vine block was. A family absent from the table has no weathered variant *on
 * purpose*: bricks, terracotta, concrete, quartz, sandstone, and every plank
 * and wood family. Those decay by removal, which is §5.2's second clause and
 * the clause that makes the rule good rather than merely safe — a wooden house
 * that fell in leaves its plinth, its chimney and a few studs.
 */
export const WEATHERED_VARIANTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  stone_bricks: ["cracked_stone_bricks", "mossy_stone_bricks"],
  stone: ["cobblestone", "mossy_cobblestone"],
  cobblestone: ["cobblestone", "mossy_cobblestone"],
  mossy_cobblestone: ["mossy_cobblestone", "cobblestone"],
  mossy_stone_bricks: ["mossy_stone_bricks", "cracked_stone_bricks"],
  chiseled_stone_bricks: ["cracked_stone_bricks", "mossy_stone_bricks"],
  smooth_stone: ["cobblestone", "mossy_cobblestone"],
  andesite: ["cobblestone", "mossy_cobblestone"],
  polished_andesite: ["cobblestone", "mossy_cobblestone"],
  granite: ["cobblestone", "mossy_cobblestone"],
  polished_granite: ["cobblestone", "mossy_cobblestone"],
  diorite: ["cobblestone", "mossy_cobblestone"],
  polished_diorite: ["cobblestone", "mossy_cobblestone"],
  deepslate: ["cobbled_deepslate", "cobbled_deepslate"],
  deepslate_bricks: ["cracked_deepslate_bricks", "cobbled_deepslate"],
  deepslate_tiles: ["cracked_deepslate_tiles", "cobbled_deepslate"],
  polished_deepslate: ["cobbled_deepslate", "cracked_deepslate_bricks"],
  polished_blackstone_bricks: [
    "cracked_polished_blackstone_bricks",
    "cracked_polished_blackstone_bricks",
  ],
  nether_bricks: ["cracked_nether_bricks", "cracked_nether_bricks"],
});

/** True for a family member that is the *mossy* one, **by name** (WP6 §4.2). */
function isMossyVariant(name: string): boolean {
  return name.startsWith("mossy_");
}

/**
 * A block's weathered variant, or `null` when its family has none.
 *
 * `k` is the cell's own hash, so a wall comes up mixed rather than uniformly
 * cracked — the same positional variation the five relics get from their own
 * `cellHash` calls, and no draw and no seed, because a fit-out has neither.
 *
 * ## The mossy re-clad, lifted (RUINS-PLAN-v0-WP6 §4.2)
 *
 * `mossy` is the weight of the family's **mossy** member, and the member is
 * identified **by name** (`mossy_*`), never by index, because the shipped table
 * is not index-consistent: `stone_bricks` is `[cracked, mossy]` and
 * `mossy_cobblestone` is `[mossy, cobblestone]`. A family with no `mossy_*`
 * member — deepslate, blackstone, nether brick — is unaffected and the lift is
 * inert there, which is correct: a blackstone ruin cracks, it does not go
 * green, and forcing moss onto it would be the re-clad rule violated from the
 * inside.
 *
 * **The draw is the existing `k`** — no new salt, no re-roll — decomposed so
 * that two things hold at once:
 *
 * - at the default weight of `0.5` the pick is **exactly** `family[k % len]`,
 *   which is what every world compiled before WP-6 got;
 * - the mossy set is **monotone** in `mossy`: raising the weight only ever
 *   turns more cells green and never moves one that was already mossy. That is
 *   MONOTONE GREEN bought for one parameter — a light quarter's mossy courses
 *   are a subset of a total quarter's.
 *
 * The decomposition: `k`'s low bit already decides today's pick, so it is kept
 * as the half of the unit interval the cell lands in, and the rest of `k`
 * spreads the cell uniformly inside that half. A cell that is mossy today sits
 * in `[0, 0.5)`; one that is not sits in `[0.5, 1)`; the test is `u < mossy`.
 */
export function weatheredOf(block: string, k: number, mossy = 0.5): string | null {
  const family = WEATHERED_VARIANTS[block];
  if (family === undefined) return null;
  const here = k % family.length;
  const mossyIndex = family.findIndex(isMossyVariant);
  // No mossy member, or the family is uniform: the weight has nothing to move.
  if (mossyIndex < 0 || family.every((m) => m === family[0])) return family[here] as string;
  const other = family.findIndex((m) => !isMossyVariant(m));
  if (other < 0) return family[mossyIndex] as string;
  // `[0, 1)`, uniform, and on the mossy side of 0.5 exactly when today's pick
  // is the mossy one.
  const spread = (k >>> 1) / 2147483648;
  const u = here === mossyIndex ? spread * 0.5 : 0.5 + spread * 0.5;
  return family[u < mossy ? mossyIndex : other] as string;
}

/**
 * How much extra of the wall a variant-less column loses.
 *
 * RUINS-PLAN §5.2: *"`intensity` is raised by `TIMBER_EXTRA = 0.15` for a
 * survivor course whose block has no variant"*. Expressed here as courses off
 * the crumble line, because that is what "raise the intensity for this column"
 * means once the profile's dials are already fixed — the crumble simply runs
 * lower on wood, which is exactly the read: a timber ruin is a plinth and a few
 * studs, a stone ruin is a standing wall.
 */
export const TIMBER_EXTRA = 0.15;

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
  timberByRemoval = false,
): number {
  if (protectedColumn(ctx, x, z)) return plan.wallTop;
  if (style.cornersStand && isCorner(plan, x, z)) return plan.wallTop;
  const salt = saltOf(ctx.archetype);
  const spread = Math.max(1, Math.min(style.spread, plan.wallTop));
  let h = style.floor + (cellHash(salt, x, z) % spread);
  // **Timber decays by removal** (§5.2). A column whose own block has no
  // weathered variant is not re-clad in something the building is not made of;
  // the crumble line runs lower on it instead. Off unless the profile asks for
  // it, so the five relics' heights cannot move.
  if (timberByRemoval) {
    const standing = ctx.blockAt(x, 2, z);
    if (standing !== undefined && weatheredOf(standing.block, 0) === null) {
      h -= Math.max(1, Math.round(TIMBER_EXTRA * plan.wallTop));
    }
  }
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
  clad: (x: number, y: number, z: number) => string | null,
  timberByRemoval = false,
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
    const h = Math.max(
      crumbleHeight(ctx, plan, style, cell.x, cell.z, timberByRemoval),
      floor,
    );
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
      // THE RE-CLAD RULE's second clause: no variant, no re-clad. The block the
      // shell built with stays exactly as it is, and the crumble line has
      // already run lower here (see {@link TIMBER_EXTRA}).
      const dressed = clad(cell.x, y, cell.z);
      if (dressed === null) continue;
      ctx.put(cell.x, y, cell.z, dressed);
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
): { x: number; z: number }[] {
  const it = ctx.interior;
  const salt = saltOf(ctx.archetype);
  const lampX = Math.floor((it.x0 + it.x1) / 2);
  const lampZ = Math.floor((it.z0 + it.z1) / 2);
  const laid: { x: number; z: number }[] = [];
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (protectedColumn(ctx, x, z)) continue;
      if (x === lampX && z === lampZ) continue;
      if (cellHash(salt + 19, x, z) % 100 >= density) continue;
      if (!c.put1(x, z, heap(x, z))) continue;
      laid.push({ x, z });
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
        // The wall has to be a **full cube** for the vine's face to hold on to
        // it, and `canSupport` is the one place that question is answered
        // (§5.6's rule, and `support.ts`'s opening paragraph). A window pane, a
        // stair, a fence or a trapdoor in the wall plane is not something a
        // vine sheet lies against: vanilla drops that face on the first block
        // update, and until then it renders as a plate in mid-air.
        //
        // Found by RUINS-PLAN-v0-WP6 §8's **rule 27** on the WP-2 catalog sweep
        // and on the F19 ruined-district fixture, which is the whole reason the
        // rule exists — the 26 shipped rules put `vine` in `INSUBSTANTIAL` and
        // could not see this at all.
        if (!canSupport(wall.block)) continue;
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

/**
 * Operator: **strip the roof plant** — the flourish above the roof goes too.
 *
 * {@link breakRoof} clears the band the *shell* built in, `wallTop + 1` up to
 * the roof's own ceiling. An archetype's exterior flourish stands above that:
 * a windmill's cross, a steeple, a mast, a canopy's posts are emitted by the
 * fit-out at heights the roof generator never reached, and the first WP-2
 * catalog sweep found them still hanging in the air over a shell whose roof was
 * gone — `floating.isolated`, four oak logs at a time.
 *
 * Written as "air where something is" rather than "air over the whole band",
 * which is what keeps it free for the five relics: none of them builds a
 * flourish, so this operator emits nothing at all for them and WP-1's
 * list-identity holds.
 */
function stripRoofPlant(ctx: FitOutContext, plan: DecayPlan): void {
  for (let y = plan.top + 3; y <= plan.top + FLOURISH_CEILING; y++) {
    for (let z = -1; z <= plan.sz; z++) {
      for (let x = -1; x <= plan.sx; x++) {
        const op = ctx.blockAt(x, y, z);
        if (op === undefined || op.block === "air") continue;
        ctx.put(x, y, z, "air");
      }
    }
  }
}

/**
 * How far above the roof a flourish can reach.
 *
 * The tallest exterior flourish in the catalog is a windmill's cross; this is a
 * generous ceiling over it rather than a measured one, because the scan costs a
 * lookup per cell and emits nothing where nothing stands.
 */
const FLOURISH_CEILING = 40;

/* -------------------------------------------------------------------------- */
/* WP-2: quench — cold and dry, over the whole catalog                         */
/* -------------------------------------------------------------------------- */

/**
 * Operator: **`quench`** (RUINS-PLAN §5.5) — the fire out and the water gone.
 *
 * "A ruin is cold and dry" is free while the only ruins are five shells that
 * were never lit. It stops being free the moment the input is an arbitrary
 * archetype: a smithy has a forge fire, a bathhouse has a pool, a greenhouse
 * has farmland and crops. This is the general answer, and it runs **before**
 * the crumble so the crumble can then take the emptied fixture away.
 *
 * - the **fire family** goes out: `fire`/`soul_fire` and every torch, lantern
 *   and candle to air or unlit, `lit=true` furnaces/smokers/blast furnaces and
 *   campfires to `lit=false`, `lava` to air;
 * - **fluids** go to air, and `waterlogged=true` becomes `false` on anything
 *   that survives — a ruin that holds water is a fluid-lint finding waiting for
 *   the first tick;
 * - **the basins stay.** Removing the water leaves the dressed basin, which
 *   reads as a drained pool, and it costs nothing;
 * - **crops and farmland** become a `dead_bush` on `coarse_dirt`, because
 *   farmland with no crop reverts to dirt anyway (FARM-PLAN §6.2's persistence
 *   law) and a dead bush says the same thing on purpose.
 *
 * Returns the number of cells it changed, for the report.
 */
export function quench(ctx: FitOutContext, plan: DecayPlan): number {
  let n = 0;
  const kill = (x: number, y: number, z: number): void => {
    ctx.put(x, y, z, "air");
    n++;
  };
  for (let y = 0; y <= plan.top + 2; y++) {
    for (let z = -1; z <= plan.sz; z++) {
      for (let x = -1; x <= plan.sx; x++) {
        const op = ctx.blockAt(x, y, z);
        if (op === undefined) continue;
        const b = op.block;
        const props = op.props;
        if (b === "farmland" || b === "soul_sand" && props?.["farm"] === "true") {
          ctx.put(x, y, z, "coarse_dirt");
          n++;
          continue;
        }
        if (CROPS.test(b)) {
          // A dead bush needs ground, and the cell under a crop is farmland,
          // which the sweep above has already turned into coarse dirt.
          ctx.put(x, y, z, "dead_bush");
          n++;
          continue;
        }
        if (FIRE_OUT.test(b) || b === "water" || b === "lava" || b === "bubble_column") {
          kill(x, y, z);
          continue;
        }
        if (props === undefined) continue;
        if (props["lit"] === "true") {
          ctx.put(x, y, z, b, { ...props, lit: "false" });
          n++;
          continue;
        }
        if (props["waterlogged"] === "true") {
          ctx.put(x, y, z, b, { ...props, waterlogged: "false" });
          n++;
        }
      }
    }
  }
  return n;
}

/** Blocks the quench removes outright — the fire family and the fluids. */
const FIRE_OUT =
  /^(fire|soul_fire|torch|soul_torch|redstone_torch|wall_torch|soul_wall_torch|redstone_wall_torch|lantern|soul_lantern|candle|.*_candle|flowing_water|flowing_lava)$/;

/** Crops the quench replaces with a dead bush. See §5.5. */
const CROPS =
  /^(wheat|carrots|potatoes|beetroots|melon_stem|pumpkin_stem|attached_melon_stem|attached_pumpkin_stem|sweet_berry_bush|torchflower_crop|pitcher_crop|nether_wart|cocoa)$/;

/* -------------------------------------------------------------------------- */
/* WP-2: reachOrRefuse — the guarantee, checked                                */
/* -------------------------------------------------------------------------- */

/** What {@link reachOrRefuse} concluded about an interior. */
export interface ReachResult {
  /** Rubble heaps withdrawn to re-open a stranded cell. */
  readonly withdrawn: number;
  /** Open interior cells still unreachable from the door. */
  readonly unreachable: number;
  /** True when the lot's decay must be refused whole (RUINS-PLAN §5.7). */
  readonly refused: boolean;
}

/**
 * Operator: **`reachOrRefuse`** (RUINS-PLAN §5.7) — every open interior cell
 * still reaches the door, **checked** rather than argued.
 *
 * The relic file gets this by construction: rubble goes through
 * {@link PropCounter.put1}, which honours the ground floor's own reservation.
 * That still holds — which is why the five relics never lose a heap here — but
 * on an arbitrary plan it is no longer *obvious*, so:
 *
 * 1. flood the shell's open interior cells from the cell inside the door;
 * 2. any open cell not reached: withdraw the rubble heap that sealed it —
 *    rubble is the only *additive* interior move — and re-flood. **Once**;
 * 3. still unreachable: the caller must refuse the lot's decay whole and build
 *    the intact shell instead (`LOAM-W510 RUIN_LOT_REFUSED`, WP-3). Refused
 *    whole rather than shipped broken is the standing pattern.
 *
 * The refusal is *reported*, not enacted, because a fit-out cannot un-build the
 * shell it has already written over. WP-3's per-lot roll is the caller that can.
 */
export function reachOrRefuse(
  ctx: FitOutContext,
  heaps: readonly { readonly x: number; readonly z: number }[],
): ReachResult {
  const start = insideDoor(ctx);
  if (start === null) return { withdrawn: 0, unreachable: 0, refused: false };
  const floor = new Set(ctx.floorCells.map((cell) => `${cell.x},${cell.z}`));
  const open = (x: number, z: number): boolean => {
    if (!floor.has(`${x},${z}`)) return false;
    const op = ctx.blockAt(x, 1, z);
    if (op === undefined || op.block === "air") return true;
    // The lint's own vocabulary, not a second one. A cell holding a flower pot
    // is a cell the physics lint calls *standable* — a pot is not a full cube
    // and not an obstacle — so it is a cell the lint demands a walking route
    // to. This flood used to call it sealed, so it never appeared in `stranded`
    // and the heap that had walled it in was never withdrawn: a shipped
    // `traversal.unreachable` on a potted plant in a decayed shell, on any seed
    // whose rubble happened to land on the three cells around a pot.
    //
    // `bodyFits` is the op-list twin of the lint's `passableAt` (shared
    // `BODY_BLOCKING`, `canSupport` standing in for the registry's
    // `isFullCube`); {@link PASSABLE_IN_RUIN} stays as its floor, for the few
    // names — a dead bush, snow, a light — a name-level cube test calls solid.
    return PASSABLE_IN_RUIN.test(op.block) || bodyFits(op.block);
  };
  const flood = (): Set<string> => {
    const seen = new Set<string>();
    if (!open(start.x, start.z)) return seen;
    const queue = [start];
    seen.add(`${start.x},${start.z}`);
    while (queue.length > 0) {
      const cell = queue.pop() as { x: number; z: number };
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = cell.x + dx;
        const nz = cell.z + dz;
        const key = `${nx},${nz}`;
        if (seen.has(key) || !open(nx, nz)) continue;
        seen.add(key);
        queue.push({ x: nx, z: nz });
      }
    }
    return seen;
  };
  const stranded = (seen: ReadonlySet<string>): { x: number; z: number }[] =>
    ctx.floorCells
      .filter((cell) => open(cell.x, cell.z) && !seen.has(`${cell.x},${cell.z}`))
      .map((cell) => ({ x: cell.x, z: cell.z }));

  let lost = stranded(flood());
  if (lost.length === 0) return { withdrawn: 0, unreachable: 0, refused: false };
  // The heaps that touch a stranded cell are the ones that sealed it. Withdraw
  // those and nothing else: a ruin that loses every heap on one bad corner is a
  // swept ruin.
  let withdrawn = 0;
  const lostSet = new Set(lost.map((cell) => `${cell.x},${cell.z}`));
  for (const heap of heaps) {
    const touches = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dz]) => lostSet.has(`${heap.x + (dx as number)},${heap.z + (dz as number)}`));
    if (!touches) continue;
    ctx.put(heap.x, 1, heap.z, "air");
    // The moss carpet stood on the heap; it has nothing to stand on now.
    const above = ctx.blockAt(heap.x, 2, heap.z);
    if (above !== undefined && above.block.endsWith("_carpet")) ctx.put(heap.x, 2, heap.z, "air");
    withdrawn++;
  }
  lost = stranded(flood());
  return { withdrawn, unreachable: lost.length, refused: lost.length > 0 };
}

/** What a player walks through on a ruined floor without it counting as sealed. */
const PASSABLE_IN_RUIN = /^(vine|cobweb|.*_carpet|dead_bush|.*_torch|torch|snow|light)$/;

/* -------------------------------------------------------------------------- */
/* WP-2: the collapse-by-category table                                        */
/* -------------------------------------------------------------------------- */

/** Catalog categories whose masonry goes last at the corners (§5.1). */
const STRUCTURED_CATEGORIES: ReadonlySet<string> = new Set([
  "military",
  "civic",
  "religious",
  "memorial",
]);

/** Catalog category per archetype id, resolved once. */
const CATEGORY_OF: ReadonlyMap<string, string> = new Map(
  STRUCTURE_CATALOG.map((entry) => [entry.id, entry.category] as const),
);

/**
 * A shell's default collapse shape (RUINS-PLAN §5.1).
 *
 * Drawn from the catalog **category** rather than from a per-archetype list,
 * which is the whole point: one table, nothing to maintain, and a new catalog
 * entry inherits a sane collapse the day it lands.
 *
 * - `defensive`/`civic`/`faith` — `military`, `civic`, `religious`, `memorial`
 *   in the catalog's own vocabulary — read as *mass* and get `structured`;
 * - a **tower-shaped** footprint (height > 2 × the longest plan side) reads as
 *   *one event* and gets `leaning`: a tower falls over, it does not weather
 *   away. Checked first, because a bell tower is `religious` and is still a
 *   tower;
 * - everything else gets `even`, the shape that reads as *time*.
 *
 * The band draw's one-in-six promotion of `even` → `structured` is **WP-3**:
 * it belongs beside the band table, which is the one function from `decline` to
 * a profile.
 */
export function collapseForShell(
  archetype: string,
  size: readonly [number, number, number],
): "even" | "structured" | "leaning" {
  const [sx, sy, sz] = size;
  if (sy > 2 * Math.max(sx, sz)) return "leaning";
  const category = CATEGORY_OF.get(archetype);
  if (category !== undefined && STRUCTURED_CATEGORIES.has(category)) return "structured";
  return "even";
}

/* -------------------------------------------------------------------------- */
/* WP-2: a decay profile for an arbitrary shell                                */
/* -------------------------------------------------------------------------- */

/**
 * The materials a decay writes with, **derived from the shell itself**.
 *
 * THE RE-CLAD RULE in the form the general case needs it: every block this
 * returns is either a weathered variant of the block that is already standing
 * in that column, or `null`, which leaves the shell's own block alone. Nothing
 * is invented. Moss is the single exception the rule itself grants, and it is
 * added by `green` and by the heap carpet — not here — because moss is not the
 * building's material, it is what is growing on it.
 */
export function derivedMaterials(ctx: FitOutContext, mossy = 0.5): DecayMaterials {
  const salt = saltOf(ctx.archetype);
  const wall = (ctx.style["wall.primary"] ?? "cobblestone") as string;
  /** The weathered form of whatever stands at a cell, or of the wall block. */
  const weatherAt = (x: number, y: number, z: number, k: number): string | null => {
    const standing = ctx.blockAt(x, y, z);
    const block = standing === undefined ? wall : standing.block;
    return weatheredOf(block, k, mossy);
  };
  const rubbleBlock = (x: number, z: number): string => {
    // A heap is made of what fell: the wall's own weathered form where it has
    // one, and the wall block itself where it has not — a timber ruin heaps
    // timber, which is both honest and the only answer the rule allows.
    return weatheredOf(wall, cellHash(salt + 71, x, z), mossy) ?? wall;
  };
  return {
    clad: (x, y, z) => weatherAt(x, y, z, cellHash(salt + 61, x + y, z)),
    fragmentStyle: "roof.slab",
    spill: rubbleBlock(0, 0),
    heap: rubbleBlock,
    // Not the relics' recolour: a general shell's floor is its own, and
    // repainting a bathhouse's tiles brown is inventing a material by another
    // route. The rubble and the green are what say "nobody has swept here".
    floorPaint: () => null,
  };
}

/* -------------------------------------------------------------------------- */
/* WP-3: the onset curve and the intensity bands                               */
/* -------------------------------------------------------------------------- */

/**
 * Below this, `decline` is **wear, not ruin** (RUINS-PLAN §4.1).
 *
 * `0.3² = 0.09` — nine percent of a kept-up town's houses fallen in. A single
 * ruined house on an otherwise maintained street does not read as decline, it
 * reads as a bug, so the curve gets a step: at the onset a place stops being
 * tired and starts being abandoned.
 */
export const RUIN_ONSET = 0.35;

/**
 * The share of a district's infill lots that roll into ruined shells.
 *
 * Squared, sharing the curve `decay.coverage` already uses — one dial, one
 * curve, ground decay and building ruin rising together — plus the onset.
 * **There is no survivor cap** (ratified by Kai, 2026-08-09, overriding the
 * draft's `RUIN_SHARE_MAX = 0.92`): a prompt that says "nothing left standing"
 * gets literal truth, and `decline = 1.0` is total desolation.
 */
export function ruinShare(decline: number): number {
  if (!Number.isFinite(decline) || decline < RUIN_ONSET) return 0;
  return Math.min(1, decline * decline);
}

/** How far gone one ruin is (RUINS-PLAN §6). The share says *how many*. */
export type DecayBand = "light" | "heavy" | "total";

/** One row of §6's band table. */
export interface DecayBandRow {
  /** The `intensity` this band carries, and the value `params.decay` takes. */
  readonly intensity: number;
  /** The spread of surviving wall heights above the crumble floor. */
  readonly collapseSpread: number;
  readonly rubble: number;
  readonly overgrowth: number;
  /**
   * **The green skin's one dial** (RUINS-PLAN-v0-WP6 §7).
   *
   * WP-6 adds exactly one field to this row and derives every share it needs
   * from it by the fixed ratio table in {@link greenSkinShares}, which is what
   * keeps §6's *"the only place these numbers appear"* literally true one
   * storey up.
   *
   * | band | the read |
   * |---|---|
   * | `light` (0.25) | moss in the joints, ivy on a north wall. *Neglected.* |
   * | `heavy` (0.55) | walls half green, windows stuffed. *Overgrown.* |
   * | `total` (0.85) | every face green to the head course. *Buried.* |
   */
  readonly skin: number;
  /** `total` stands the corners: a stump at each quoin is what is left. */
  readonly cornersStand: boolean;
  /** The crumble floor, which `light` states relative to the eave plate. */
  readonly collapseFloor: (wallTop: number) => number;
}

/**
 * **RUINS-PLAN §6's band table — the only place these numbers appear.**
 *
 * The share (§4.1) says how many lots ruin; the band says how far gone each
 * one is, and without it a district at 0.5 and one at 0.95 differ only in
 * count, which reads as "more of the same houses" rather than as a deeper
 * ruin. An operator reads a {@link DecayProfile}; this table is the one
 * function from `decline` to a profile, so re-tuning after a walk is one table.
 *
 * | band | `decline` | the read |
 * |---|---|---|
 * | `light` | 0.35–0.55 | roof gone in places, walls up. *Derelict.* |
 * | `heavy` | 0.55–0.80 | roofless, walls at head height, floor heaped. *Ruined.* |
 * | `total` | 0.80–1.00 | one to three courses, corner stumps, dense green. *Archaeology.* |
 *
 * §6's roof column is **not** a fourth dial: {@link breakRoof} already lays a
 * fragment on two heads in three, and only on a head that survived to the
 * plate — so `light`'s high crumble line keeps the plate course and its
 * fragments, and `heavy`/`total` take both away by taking the wall away. The
 * roof read is a consequence of the crumble floor rather than a knob beside it,
 * which is what keeps one mechanism for one invariant.
 */
export const DECAY_BANDS: Readonly<Record<DecayBand, DecayBandRow>> = Object.freeze({
  light: {
    intensity: 0.35,
    collapseSpread: 2,
    rubble: 0.15,
    overgrowth: 0.25,
    skin: 0.25,
    cornersStand: false,
    // `wallTop − 2`: the wall is up, the head is ragged, the plate is mostly
    // there. Floored at 1 for a three-course shell, which is the shortest
    // shell `decayPlan` accepts at all.
    collapseFloor: (wallTop: number) => Math.max(1, wallTop - 2),
  },
  heavy: {
    intensity: 0.6,
    collapseSpread: 3,
    rubble: 0.28,
    overgrowth: 0.45,
    skin: 0.55,
    cornersStand: false,
    collapseFloor: () => 3,
  },
  total: {
    intensity: 0.85,
    collapseSpread: 3,
    rubble: 0.4,
    overgrowth: 0.7,
    skin: 0.85,
    cornersStand: true,
    collapseFloor: () => 1,
  },
});

/** §6's band boundaries on `decline`, low to high. */
const BAND_ORDER: readonly DecayBand[] = Object.freeze(["light", "heavy", "total"] as const);

/**
 * The band a lot takes, from the district's `decline` and one positional draw.
 *
 * `jitter` is a 0..1 positional float (channel 43 in the district's roll), and
 * it moves **one lot in six** up or down one band, so a street is not uniform:
 * a derelict house among ruins and an archaeological corner in a merely
 * derelict quarter are what stop the band from reading as a setting.
 */
export function bandForDecline(decline: number, jitter: number): DecayBand {
  const base = decline < 0.55 ? 0 : decline < 0.8 ? 1 : 2;
  // A twelfth each way: a sixth of the lots move, and which way is the draw's.
  const step = jitter < 1 / 12 ? -1 : jitter >= 11 / 12 ? 1 : 0;
  const k = Math.min(BAND_ORDER.length - 1, Math.max(0, base + step));
  return BAND_ORDER[k] as DecayBand;
}

/**
 * The band an `intensity` belongs to — the seam the per-lot roll travels on.
 *
 * A lot's band reaches the grammar as `params.decay`, a single 0..1 scalar,
 * because that is the authoring surface §4.3 already defines and a second
 * per-lot channel would be a second way to say the same thing. The boundaries
 * are the midpoints between the three bands' own intensities, so a band's value
 * always round-trips to itself and an author who writes `0.8` gets `total`.
 */
export function bandForIntensity(intensity: number): DecayBand {
  if (intensity < (DECAY_BANDS.light.intensity + DECAY_BANDS.heavy.intensity) / 2) return "light";
  if (intensity < (DECAY_BANDS.heavy.intensity + DECAY_BANDS.total.intensity) / 2) return "heavy";
  return "total";
}

/* -------------------------------------------------------------------------- */
/* WP-6 §7: one dial, one table                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every share the green skin draws against, derived from one dial.
 *
 * RUINS-PLAN-v0-WP6 §7: *"it adds one field to `DecayBandRow` and derives
 * everything else from it by a fixed ratio table stated once."* This is that
 * table, and these ratios are the whole of the tuning surface — a walk re-tunes
 * {@link DecayBandRow.skin}, not the twelve numbers below.
 */
export interface GreenSkinShares {
  /** The band's own dial, 0..1. */
  readonly skin: number;
  /** Share of eligible exterior face cells that found a climbing strand. */
  readonly wallFace: number;
  /** Share of the face height below a strand's head that it covers. */
  readonly climbReach: number;
  /** Weight of the mossy member in the re-clad (§4.2). */
  readonly mossyPick: number;
  /** Share of climbers, undersides only, substituted to glow lichen. */
  readonly lichen: number;
  /** Share of openings that take a leaf plug. `light` plugs nothing. */
  readonly openingPlug: number;
  /** Carpet on rubble tops, wall heads and parapets (WP-6c). */
  readonly carpet: number;
  /** Surviving pavement and ruin yards (WP-6c). */
  readonly pavement: number;
  /** Sidewalk shrubs and tufts (WP-6d). */
  readonly streetSidewalk: number;
  /** Carriageway shrubs and tufts (WP-6d). */
  readonly streetCarriageway: number;
  /** Share of eligible street columns electing a trunk (WP-6d). */
  readonly streetTrunk: number;
  /** Chebyshev spacing between elected trunks (WP-6d). */
  readonly streetTrunkSpacing: number;
  /** Width of the continuous open lane down every street (WP-6d). */
  readonly spineWidth: number;
}

/**
 * §7's table, from a band.
 *
 * Three things it says on purpose: **`light` plugs no openings** (a neglected
 * building with leaves growing out of its windows is not neglected, it is
 * abandoned, and the band boundary is where that changes); **`total` narrows
 * the spine** to one column, which is the "buried" read; and **the trunk share
 * is small and the spacing does the work**, because spacing 5 turns a scatter
 * of points into a canopy.
 */
export function greenSkinShares(band: DecayBand): GreenSkinShares {
  const skin = DECAY_BANDS[band].skin;
  return {
    skin,
    wallFace: skin,
    climbReach: 0.4 + 0.6 * skin,
    mossyPick: skin,
    lichen: 0.15 * skin,
    openingPlug: Math.max(0, 1.2 * (skin - 0.35)),
    carpet: 0.8 * skin,
    pavement: 0.7 * skin,
    streetSidewalk: skin,
    streetCarriageway: 0.6 * skin,
    streetTrunk: 0.12 * skin,
    streetTrunkSpacing: Math.round(4 + 8 * (1 - skin)),
    spineWidth: skin >= 0.7 ? 1 : 2,
  };
}

/**
 * **A decay profile for any shell**, from one 0..1 dial.
 *
 * The landing place of `params.decay` on a `building.grammar@0` node — "a
 * broken watchtower on a ridge", one named thing ruined without a district —
 * and the shape the district's per-lot roll hands its band to.
 *
 * **WP-3 put §6's band table inside this function and took the straight-line
 * placeholder out.** There is no second set of tuned constants: every dial
 * below is read from {@link DECAY_BANDS}, which is the one table a walk
 * re-tunes.
 */
export function decayProfileFor(ctx: FitOutContext, intensity: number): DecayProfile {
  const i = Math.min(1, Math.max(0, intensity));
  const band = DECAY_BANDS[bandForIntensity(i)];
  // `total` stands the corners (§6), which is `structured` in the collapse
  // vocabulary — but never at the cost of a tower's lean, because a tower that
  // fell over did not weather away and a stump at each corner of a round-ish
  // tower is not a read anyone asked for.
  const shape = collapseForShell(ctx.archetype, ctx.size);
  const collapse = band.cornersStand && shape === "even" ? "structured" : shape;
  return {
    intensity: i,
    collapse,
    collapseFloor: Math.max(1, Math.min(band.collapseFloor(ctx.wallTop), ctx.wallTop)),
    collapseSpread: band.collapseSpread,
    overgrowth: band.overgrowth,
    rubble: band.rubble,
    quench: true,
    timberByRemoval: true,
    // §4.2, the mossy re-clad lifted: the band's own `skin` dial is the weight
    // of the family's mossy member. Same draw, no new salt — so a light
    // quarter's mossy courses are a subset of a total quarter's.
    materials: derivedMaterials(ctx, band.skin),
  };
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
  return decayShellChecked(ctx, c, profile).written;
}

/**
 * What one decay pass did — the record `BuildingMeta.decay` carries.
 *
 * A mutable sink rather than a return value because the fit-out chain reports
 * one number (blocks written) and this is four facts about a pass that ran deep
 * inside it. RUINS-PLAN §9's diagnostics are built from these.
 */
export interface DecayPassReport {
  /** Blocks written by the decay. */
  written: number;
  /** Cells the quench emptied of fire, fluid or crop. */
  quenched: number;
  /** Rubble heaps withdrawn to keep the interior reachable. */
  withdrawn: number;
  /** Ops the `settleFixtures` fixpoint deleted. */
  settled: number;
  /** True when an open interior cell is still unreachable from the door. */
  refused: boolean;
  /**
   * Which mode the shell could actually take (RUINS-PLAN §9, `LOAM-W511`).
   *
   * `"shell"` is the whole engine. `"none"` is a shell {@link decayPlan}
   * refused — a footprint that is not the plain rect, or a wall of fewer than
   * three courses, which table 14 has always excluded because a crumble line
   * drawn on it has nothing to take away. A `"none"` shell still takes the
   * floor paint and the rubble; what it does not take is a crumble.
   * `"facade"` is WP-6.
   */
  mode: "shell" | "facade" | "none";
}

/** What a decay pass did, and whether the lot must be refused (§5.7). */
export interface DecayOutcome {
  /** Blocks written by the decay. */
  readonly written: number;
  /** Cells the quench emptied of fire, fluid or crop. */
  readonly quenched: number;
  /** Rubble heaps withdrawn to keep the interior reachable. */
  readonly withdrawn: number;
  /**
   * True when an open interior cell is still unreachable from the door, so the
   * caller must build the intact shell instead (`LOAM-W510`, WP-3).
   */
  readonly refused: boolean;
  /** Which mode the shell took — see {@link DecayPassReport.mode}. */
  readonly mode: "shell" | "facade" | "none";
}

/**
 * {@link decayShell}, with the WP-2 checks' verdict handed back.
 *
 * Same pass, same order, same output. The five relics call `decayShell` and
 * ignore the verdict because they cannot fail it — a relic's rubble goes
 * through the same reservation it always did — and WP-3's per-lot roll calls
 * this one, because a roll is the only caller that can act on a refusal.
 */
export function decayShellChecked(
  ctx: FitOutContext,
  c: PropCounter,
  profile: DecayProfile,
): DecayOutcome {
  const before = c.n;
  const m = profile.materials;
  const plan = decayPlan(ctx);
  let quenched = 0;
  let heaps: readonly { readonly x: number; readonly z: number }[] = [];
  if (plan !== null) {
    // Cold and dry FIRST, so the crumble can take the emptied fixture away.
    if (profile.quench === true) quenched = quench(ctx, plan);
    const heads = crumbleWalls(
      ctx,
      c,
      plan,
      crumbleStyleOf(profile, plan),
      m.clad,
      profile.timberByRemoval === true,
    );
    breakRoof(ctx, c, plan, heads, ctx.style[m.fragmentStyle] as string);
    stripRoofPlant(ctx, plan);
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
  heaps = rubble(ctx, c, pct(profile.rubble), m.heap);
  // The guarantee, checked. Construction still gives it to the relics; an
  // arbitrary plan is asked rather than trusted.
  const reach =
    plan === null ? { withdrawn: 0, unreachable: 0, refused: false } : reachOrRefuse(ctx, heaps);
  return {
    written: c.n - before,
    quenched,
    withdrawn: reach.withdrawn,
    refused: reach.refused,
    mode: plan === null ? "none" : "shell",
  };
}

/* -------------------------------------------------------------------------- */
/* the post-guards                                                             */
/* -------------------------------------------------------------------------- */

/**
 * **Nothing the decay unsupported may survive it.** Run after the decay and
 * after the ruin's own furniture.
 *
 * **WP-2 put the better body inside it.** This used to be the two guards wave
 * 6E wrote by hand, because the cottage had exactly two ways to leave something
 * hanging: a ladder rung whose backing wall crumbled, and a hanging lantern
 * whose ceiling went. An arbitrary archetype has dozens — wall banners, signs,
 * item frames, paintings, flower pots, carpets, beds, hanging signs, ladders,
 * torches, upper-floor furniture whose floor plane survived but whose wall did
 * not — so the two guards are now RUINS-PLAN §5.6's **fixpoint**:
 *
 * > after the removal operators, sweep every remaining op in the shell and
 * > delete any whose support is gone, and repeat until nothing is deleted.
 *
 * Fixpoint, because a removal can unsupport the next thing; bounded by
 * {@link MAX_SETTLE_PASSES}, so it terminates. The support classification is
 * the **physics lint's own**, imported from `support.ts` rather than restated,
 * so the sweep and the lint cannot disagree — two mechanisms for one invariant
 * is how `CURB_LEVEL_TOLERANCE` happened. There must never be a second guard
 * beside this function; there must only ever be a better body inside it.
 *
 * Returns the number of ops it deleted, for the report.
 */
export function settleDecayedFixtures(ctx: FitOutContext): number {
  const plan = decayPlan(ctx);
  if (plan === null) return 0;
  /** Is there something at this cell that a fixture could hang on? */
  const solid = (x: number, y: number, z: number): boolean => {
    const op = ctx.blockAt(x, y, z);
    if (op === undefined) return false;
    return canSupport(op.block);
  };
  let removed = 0;
  // The fixpoint. Bounded by the op count in the shell — every pass either
  // deletes something or is the last one — because a removal can unsupport the
  // next thing: the crumble takes a wall, the wall took a banner, the banner
  // was what a pot stood on.
  //
  // Over the footprint **and its apron**, not the interior: a windmill's access
  // ladder and a warehouse's wall bracket are fixed to the *outside* face of a
  // wall the crumble has just taken away, and the first catalog sweep found
  // exactly that — four courses of ladder climbing air one cell outside the
  // shell. The relics never had one, which is why the interior-only sweep
  // survived WP-1.
  for (let pass = 0; pass < MAX_SETTLE_PASSES; pass++) {
    let deleted = 0;
    for (let z = -1; z <= plan.sz; z++) {
      for (let x = -1; x <= plan.sx; x++) {
        for (let y = 1; y <= plan.top + 2; y++) {
          const op = ctx.blockAt(x, y, z);
          if (op === undefined || op.block === "air") continue;
          // The way in is never swept: the door, its step and the cell inside
          // it are what the walking agent and the traversal lint start from.
          if (protectedColumn(ctx, x, z)) continue;
          const dir = supportDirection(op.block, op.props);
          if (dir === null) {
            // **The stranded fitting** (WP-3). The lint's `floating.slab` and
            // `floating.stair` rules are *geometric* rather than support-typed:
            // a slab or a stair with air on all six sides is a floating cube
            // whatever the support table says about it, and the first district
            // sweep found nine of them — a shop row's awning and a warehouse's
            // canopy left hanging in the street once the wall behind them
            // crumbled. Those blocks have no `supportDirection`, so the clause
            // above never saw them.
            //
            // **The third family, and the same rule** (2026-08-10): a *full
            // cube* with air on all six faces is `floating.isolated`, rule 13,
            // and the crumble strands those too. A high-decline metropolis
            // linted two of them — a parking garage's head-height concrete trim
            // whose wall crumbled away and whose own lower course went with the
            // spill, left hanging one block off nothing. `canSupport` is
            // exactly "a full cube by name" on the evidence a fit-out has
            // (`support.ts`), so the sweep can ask rule 13's question without
            // inventing a second solidity vocabulary.
            //
            // Still narrow: only the block families the lint polices
            // geometrically, above the plinth (`y >= 2`, so nothing standing on
            // ground the op list cannot see is ever swept), and only when *this
            // shell* holds nothing beside them.
            const floatable = FLOATABLE.test(op.block);
            if ((!floatable && !canSupport(op.block)) || y < 2) continue;
            const braced = [
              [1, 0, 0],
              [-1, 0, 0],
              [0, 0, 1],
              [0, 0, -1],
              [0, -1, 0],
              [0, 1, 0],
            ].some(([dx, dy, dz]) => {
              const near = ctx.blockAt(x + (dx as number), y + (dy as number), z + (dz as number));
              // For a slab or a stair, a neighbour that is itself a slab or a
              // stair does not count. A shop row's awning is two stairs side by
              // side: each braces the other in the shell's own op list, and the
              // world then drops one of them where it reaches into a
              // neighbour's claim — leaving the survivor with air on all six
              // sides, which is precisely the finding. Bracing has to come from
              // something that is actually holding the fitting up.
              //
              // A full cube is held to rule 13's own predicate instead, which
              // asks only whether the face is **air**: a cube with a stair
              // beside it is not an isolated block, and deleting it would be
              // this sweep inventing a defect the lint does not have.
              if (near === undefined || near.block === "air") return false;
              return floatable ? !FLOATABLE.test(near.block) : true;
            });
            if (braced) continue;
            ctx.put(x, y, z, "air");
            deleted++;
            continue;
          }
          let held: boolean;
          if (dir === "below") held = y === 1 ? true : solid(x, y - 1, z);
          else if (dir === "above") held = solid(x, y + 1, z);
          else {
            // Bracketed: `facing` points at the viewer, away from the block the
            // fixture hangs on, so the backing cell is one step the other way.
            const facing = op.props?.["facing"];
            if (facing === undefined) continue;
            const [dx, dz] = cardinalStep(facing as Cardinal);
            held = solid(x - dx, y, z - dz);
          }
          if (held) continue;
          ctx.put(x, y, z, "air");
          deleted++;
        }
      }
    }
    removed += deleted;
    if (deleted === 0) break;
  }
  return removed;
}

/**
 * The fixpoint's bound.
 *
 * A support chain inside one shell cannot be deeper than the shell is tall, and
 * every pass but the last deletes at least one op — so this is a very generous
 * ceiling that exists so a bug can never spin, not a tuning knob.
 */
const MAX_SETTLE_PASSES = 32;

/**
 * The two families the physics lint polices **geometrically** rather than by
 * support type: a slab or a stair with air on all six sides is a floating cube.
 * See the stranded-fitting clause in {@link settleDecayedFixtures}.
 */
const FLOATABLE = /(_slab|_stairs)$/;
