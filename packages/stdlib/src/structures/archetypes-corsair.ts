/**
 * The **nautical & pirate pack**, buildings half — the four shore buildings of
 * `docs/CATALOG-EXPANSION-v0.md` §3.2 that a body walks into.
 *
 * The pack's thesis is that the catalog has an excellent fleet and almost no
 * *shore*: a pirate haven is a harbour with a town behind it, and the town is
 * currently a medieval village with boats moored at the bottom of it. This
 * file is the half of §3.2 that has an inside:
 *
 * - **what the guns need** — `powder_magazine` (the one building on the point
 *   nobody puts a light inside), `martello_tower` (the squat round gun tower);
 * - **what the ships need** — `chandlery` (the shop that sells a voyage),
 *   `sail_loft` (the long clear floor the canvas is cut on).
 *
 * The law every archetype file states and this one inherits whole: **an
 * archetype is a fit-out, not a second grammar.** Everything here runs after
 * `core.ts`'s shape stages and writes into the same cell map, so a sea tower
 * is the shell wearing a tower. Not one line of `core.ts` moves for any of it.
 *
 * ## The one thing this pack must get right
 *
 * **These read from the water.** A stranger stands on the quay and names the
 * town from its skyline, so every one of the four spends its budget on the
 * thing visible at two hundred blocks — the magazine's buttressed windowless
 * box with its lights *outside*, the tower's battered chamfered drum and the
 * gun on its head, the chandlery's awning, the loft's hoist beam swinging out
 * of the gable. The interiors are furnished with what is left.
 *
 * ## The rules, inherited from the classical and alien packs
 *
 * 1. **Nothing leaves the envelope** — the footprint plus its one-block apron,
 *    and `roofTop + `{@link ROOF_FLOURISH_RISE} overhead.
 * 2. **The interior stays walkable**: every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take`, so nothing this file writes can strand a corner or seal a
 *    column.
 * 3. **Solid per course, never a ring per course.** The magazine's vault is an
 *    arc that closes on itself course by course; the tower's parapet stands on
 *    the lid under it. A stepped shell built as a floating ring is the
 *    `floating.isolated` rule waiting to happen.
 * 4. **A rebuilt roof starts with a lid** — the room below needs a ceiling and
 *    everything above needs a floor.
 * 5. **Nothing in the apron unless something in the apron holds it up.** The
 *    classical pack's deleted cornice is the scar: a buttress brings its own
 *    footing down to the ground course, and a lantern stands on the buttress
 *    cap rather than on the wall it lights.
 * 6. **The lantern rule is a name rule.** The physics lint fires on any block
 *    whose name ends in `lantern` and demands a floor under it or a chain over
 *    it — so every light this file hangs is a standing `lantern` on a masonry
 *    cap, or it is `glowstone` bracketed against a neighbour.
 * 7. **No unseeded randomness, and no wall clock.** There is no RNG in a
 *    fit-out context and this file does not want one: {@link tideJitter} is a
 *    pure integer hash of the position, which is what makes "the same document
 *    compiles to the same magazine forever" true by construction.
 * 8. No bare `flower_pot`, no sign blocks, no lit fire. A powder magazine with
 *    a fire in it is a crater.
 */

import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
} from "./archetypes-civic.js";
import { cardinalStep, type Cardinal, type LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The four archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts` immediately after the
 * alien pack's organic half, and repeated in that order in the spec's
 * `KNOWN_BUILDING_ARCHETYPES`, where the order is asserted.
 */
export const CORSAIR_BUILDING_ARCHETYPES = [
  "powder_magazine",
  "martello_tower",
  "chandlery",
  "sail_loft",
] as const;

/** One of the archetypes this file fits out. */
export type CorsairBuildingArchetype = (typeof CORSAIR_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isCorsairArchetype(value: string): value is CorsairBuildingArchetype {
  return (CORSAIR_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after the alien pack's table, where every later wave
 * sits, and for the same reason: the tables below it are greedy. The
 * **non-claims** are the load-bearing half, because this pack's vocabulary is
 * full of words older tables already own:
 *
 * - **bare `tower` is not ours.** It is the watchtower's, and has been since
 *   the original six; `lighthouse` is Track A's and `beacon`/`beacon_tower`
 *   belong to the garrison. The sea tower answers to `martello_tower`,
 *   `martello`, `sea_tower` and `gun_tower` only;
 * - **`pier`, `shipyard` and `lighthouse` are not ours** — all three are
 *   already taken elsewhere in the catalog, and a document that says any of
 *   them wants what it already gets;
 * - **`ropewalk` is not ours**: the industry wave owns it, and a rope walk is
 *   a different building from a sail loft even in a town that has both. The
 *   loft answers to `sail_loft`, `sailmaker`, `sail_house` and `rigging_loft`;
 * - **bare `store`, `shop` and `depot` are left where they were** — the
 *   granary's, the general store's and the warehouse's. The chandlery claims
 *   only `chandlery`, `chandler`, `ship_chandler` and `ships_stores`;
 * - **bare `arsenal` and bare `battery` are somebody else's already** — the
 *   garrison's `arsenal` and the `battery_shed`, both checked — and this pack
 *   claims neither. §3.2's own shore battery is a *sweep client* rather than a
 *   node, so there was never a case for taking the word back. The magazine
 *   takes `powder_magazine`, `magazine`, `powder_house` and `powder_store`;
 * - **`jolly_roger`, `gallows`, `gibbet`, `careening` and `wreck` are claimed
 *   by nobody**, on purpose: they name this pack's **props**, which are
 *   reached by name and never through this cascade. A node tagged `gallows`
 *   that silently became a *building* is worse than one that resolves to the
 *   default.
 */
export function corsairArchetypeOfTags(tags: readonly string[]): CorsairBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (
    has("powder_magazine") ||
    has("magazine") ||
    has("powder_house") ||
    has("powder_store")
  ) {
    return "powder_magazine";
  }
  if (
    has("martello_tower") ||
    has("martello") ||
    has("sea_tower") ||
    has("gun_tower")
  ) {
    return "martello_tower";
  }
  if (
    has("chandlery") ||
    has("chandler") ||
    has("ship_chandler") ||
    has("ships_stores")
  ) {
    return "chandlery";
  }
  if (
    has("sail_loft") ||
    has("sailmaker") ||
    has("sail_house") ||
    has("rigging_loft")
  ) {
    return "sail_loft";
  }
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's — defaults a caller merges, never
 * something applied over an explicit param.
 *
 * The magazine asks for `windowRhythm: "none"`, and that is the *building*:
 * the curator's note says one door and no windows, and a rank of glass in a
 * powder store is the one detail that would make a stranger read it as a barn.
 * The sea tower asks for `flat`, because its whole top is a gun platform and a
 * gable over it would be a cottage on a rock. The chandlery asks for as much
 * glass as the wall allows — a shop is read through its window — and the sail
 * loft for a gable, which is the face its hoist door and beam are cut into.
 */
export function corsairFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "powder_magazine":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "martello_tower":
      // **`hip`, not `flat`, and the reason is arithmetic rather than taste.**
      // The gun platform is a *rebuild*: the roof comes off and a lid and a
      // parapet go down in its place, and a flat roof leaves `roofTop` one
      // course over the plate — an allowance of one, which is a lid and
      // nothing on it. A hip roof gives the tower the headroom its own
      // parapet, merlons and gun are built in. `flat` still works (the plan
      // below degrades to a lid and a parapet with no merlons); it just gives
      // a poorer tower, and the default should not.
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "chandlery":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    case "sail_loft":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the shared machinery                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What an exterior rebuild needs to know, or `null` when it may not run.
 *
 * The classical and alien packs' plan in every respect, restated rather than
 * imported for the reason they restated the sanctum's: two packs are two
 * seams, and a shared private helper is a shared edit. The refusals are the
 * same — a **plain rect** only, and two courses of room over the plate before
 * a roof may be rebuilt.
 */
interface CorsairPlan {
  readonly sx: number;
  readonly sz: number;
  /** Y of the roof's lowest course — one above the eave plate. */
  readonly base: number;
  /** Highest Y anything may occupy: the shell's roof top plus the allowance. */
  readonly top: number;
  readonly rect: LocalRect;
}

/** The plan for work on the **walls**: the rect condition, and nothing else. */
function wallPlan(ctx: FitOutContext): CorsairPlan | null {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) return null;
  return {
    sx,
    sz,
    base: ctx.wallTop + 1,
    top: ctx.roofTop + ROOF_FLOURISH_RISE,
    rect: { x0: 0, z0: 0, x1: sx - 1, z1: sz - 1 },
  };
}

/** The plan for a **roof rebuild**: a wall plan that also has room to build in. */
function roofPlan(ctx: FitOutContext): CorsairPlan | null {
  const plan = wallPlan(ctx);
  if (plan === null) return null;
  return plan.top - plan.base < 2 ? null : plan;
}

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: CorsairPlan): void {
  for (let y = plan.base; y <= plan.top + 2; y++) {
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) ctx.put(x, y, z, "air");
    }
  }
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

/** The apron ring — the one-block skirt outside the footprint. */
function apronOf(sx: number, sz: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = -1; z <= sz; z++) {
    for (let x = -1; x <= sx; x++) {
      if (x === -1 || x === sx || z === -1 || z === sz) out.push({ x, z });
    }
  }
  return out;
}

/** The cell a player stands in to open the door, or `null` when there is none. */
function outsideDoor(ctx: FitOutContext): { readonly x: number; readonly z: number } | null {
  if (ctx.door === null) return null;
  const [dx, dz] = cardinalStep(ctx.door.face);
  return { x: ctx.door.x + dx, z: ctx.door.z + dz };
}

/** True when a cell is the doorstep or the door column itself. */
function onWayIn(ctx: FitOutContext, x: number, z: number): boolean {
  if (ctx.door === null) return false;
  if (x === ctx.door.x && z === ctx.door.z) return true;
  const out = outsideDoor(ctx);
  return out !== null && out.x === x && out.z === z;
}

/**
 * Blocks a re-clad may never overwrite.
 *
 * The classical and alien packs' list unchanged: the way in, the way up, the
 * fire, the glass and anything the physics lint holds to a support rule.
 */
const PRESERVE = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

/** True when the shell put something at this cell a fit-out must leave alone. */
function protectedAt(ctx: FitOutContext, x: number, y: number, z: number): boolean {
  const standing = ctx.blockAt(x, y, z);
  return standing !== undefined && PRESERVE.test(standing.block);
}

/**
 * True when a wall column carries anything a fit-out must leave alone.
 *
 * **A door is taller than its door block**, which the classical pack paid a
 * sweep to learn: cutting the courses over a door leaves the shell's little
 * doorstep awning hanging on nothing. Every chamfer in this file therefore
 * skips the whole column a protected block stands anywhere in.
 */
function columnProtected(ctx: FitOutContext, x: number, z: number): boolean {
  for (let y = 1; y <= ctx.wallTop; y++) if (protectedAt(ctx, x, y, z)) return true;
  return false;
}

/** Re-clad the wall ring between two courses. `block` is a pure function of position. */
function reclad(
  ctx: FitOutContext,
  plan: CorsairPlan,
  yFrom: number,
  yTo: number,
  block: (x: number, y: number, z: number) => string,
): number {
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    for (let y = yFrom; y <= yTo; y++) {
      if (protectedAt(ctx, cell.x, y, cell.z)) continue;
      ctx.put(cell.x, y, cell.z, block(cell.x, y, cell.z));
      n++;
    }
  }
  return n;
}

/** The masonry mix a re-clad draws from — the shell's own stone palette. */
function masonry(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (x, y, z) => (tideJitter(x, y, z, 6) === 0 ? accent : primary);
}

/** Ashlar — the same palette laid in courses rather than in a scatter. */
function ashlar(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (_x, y, _z) => (y % 4 === 0 ? accent : primary);
}

/**
 * Fill the ground course under an apron cell when the ground there is air.
 *
 * Wave 4B's cathedral lesson, restated: the apron is not always at `y = 1`,
 * and a buttress whose foot is air is a buttress standing on nothing.
 */
function footing(ctx: FitOutContext, c: PropCounter, x: number, z: number, block: string): void {
  if (ctx.blockAt(x, 0, z) === undefined) c.raw(x, 0, z, block);
}

/** The middle column of the room — where the shell hangs its lantern. */
function lanternColumn(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
}

/** The end of the room furthest from the door, and the way a person looks at it. */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/** The cardinal a unit step points along. */
function cardinalOf(dx: number, dz: number): Cardinal {
  if (dx > 0) return "east";
  if (dx < 0) return "west";
  return dz > 0 ? "south" : "north";
}

/** The cardinal facing the other way. */
function opposite(facing: Cardinal): Cardinal {
  switch (facing) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "east":
      return "west";
    default:
      return "east";
  }
}

/**
 * A deterministic small draw, keyed on whatever the caller hands it.
 *
 * There is no RNG in a {@link FitOutContext} and this file does not want one:
 * a position-derived integer hash is the idiom every earlier wave uses, it is
 * a pure function, and it makes "the same document compiles to the same
 * magazine forever" true by construction rather than by test. `Math.imul` is
 * exactly specified where `Math.pow` is not, which is why the mix uses it.
 */
function tideJitter(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/** A solid lid over the whole footprint at the roof's first course (rule 4). */
function lid(ctx: FitOutContext, c: PropCounter, plan: CorsairPlan): void {
  const block = ctx.style["foundation.accent"] as string;
  const solid = ctx.style["roof.solid"] as string;
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) {
      c.raw(x, plan.base, z, tideJitter(x, plan.base, z, 5) === 0 ? solid : block);
    }
  }
}

/**
 * A gun on its truck, pointing out over the water.
 *
 * Three blocks and one of the pack's two recurring reads (the other is the
 * black flag). The barrel is a run of `polished_blackstone` — a dark cube in
 * any palette, which is what a gun has to be in a medium with no dark metal —
 * the muzzle is a wall block that tapers it, and the trucks are trapdoors
 * hinged on the barrel blocks themselves, which is both the read and the
 * support argument: every piece of it touches a piece already written.
 *
 * `y` is the course the gun stands *on*; nothing is written below it.
 */
function gun(c: PropCounter, x: number, y: number, z: number, facing: Cardinal): void {
  const [dx, dz] = cardinalStep(facing);
  c.raw(x, y, z, "polished_blackstone");
  c.raw(x + dx, y, z + dz, "polished_blackstone");
  c.raw(x + dx * 2, y, z + dz * 2, "polished_blackstone_wall", {
    up: "true",
    north: "none",
    south: "none",
    east: "none",
    west: "none",
    waterlogged: "false",
  });
  // The trucks: a wheel each side, hinged on the breech block beside them —
  // an open trapdoor's hinge is the block its `facing` points *away* from, so
  // each wheel faces outboard.
  for (const side of [1, -1]) {
    const ox = dz * side;
    const oz = dx * side;
    c.raw(x + ox, y, z + oz, "dark_oak_trapdoor", {
      facing: cardinalOf(ox, oz),
      half: "bottom",
      open: "true",
      powered: "false",
      waterlogged: "false",
    });
  }
}

/* -------------------------------------------------------------------------- */
/* dispatch                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this pack's buildings.
 *
 * Returns the number of ops written, which `furnish` adds to its own count.
 * Anything that is not one of ours returns 0 without touching a cell.
 */
export function furnishCorsair(ctx: FitOutContext): number {
  if (!isCorsairArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "powder_magazine":
      fitPowderMagazine(ctx, c);
      break;
    case "martello_tower":
      fitMartelloTower(ctx, c);
      break;
    case "chandlery":
      fitChandlery(ctx, c);
      break;
    case "sail_loft":
    default:
      fitSailLoft(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the powder magazine                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `powder_magazine` — the building the whole town stands back from.
 *
 * The curator's note is a list of *refusals*, and refusals are hard to make
 * legible: thick walls, one door, no windows, and the lanterns outside. A
 * windowless box is a shed. So the icon is built from the three things that
 * make a magazine look like a magazine from across the water:
 *
 * 1. **the buttresses** — piers in the apron at a regular bay spacing, each
 *    one grounded at the ground course, each capped with a stair that slopes
 *    back into the wall. A buttressed wall reads as *thick* whatever it
 *    actually is, and the bay rhythm is what a windowless wall has instead of
 *    windows;
 * 2. **the lights, outside** — a standing lantern on every other buttress cap.
 *    Outside the wall is the entire point of the note (a flame indoors is a
 *    crater), and a lantern standing on masonry is the one lit block the
 *    lint's name rule is always happy with;
 * 3. **the vault** — the roof comes off and is rebuilt as a barrel: an arc
 *    over the long axis, closed at both gable ends, drawn from an integer
 *    ellipse test so there is no transcendental anywhere in it. It is a
 *    **shell**, and each of its cells is written where the arc under and
 *    beside it is written too, so nothing on it is ever isolated.
 *
 * Inside is powder: barrels down both long walls in a double rank where the
 * room is wide enough, the middle left clear, and no light at all.
 */
function fitPowderMagazine(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const stone = ctx.style["foundation.primary"] as string;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));

    // --- the buttresses -----------------------------------------------------
    // Every third bay along each face, never at a corner and never over the
    // way in. The pier is grounded, capped, and the cap is what the light
    // stands on — rule 5, met by construction.
    const capY = Math.max(2, ctx.wallTop - 1);
    let bay = 0;
    for (const cell of apronOf(wall.sx, wall.sz)) {
      const corner =
        (cell.x === -1 || cell.x === wall.sx) && (cell.z === -1 || cell.z === wall.sz);
      if (corner) continue;
      const along = cell.x === -1 || cell.x === wall.sx ? cell.z : cell.x;
      if (along < 1 || along % 3 !== 1) continue;
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      bay++;
      footing(ctx, c, cell.x, cell.z, stone);
      for (let y = 1; y < capY; y++) c.raw(cell.x, y, cell.z, stone);
      // The cap slopes back into the wall it braces: a stair's `facing` is the
      // direction of its high half, so it faces the building.
      const towards: Cardinal =
        cell.x === -1 ? "east" : cell.x === wall.sx ? "west" : cell.z === -1 ? "south" : "north";
      c.raw(cell.x, capY, cell.z, ctx.style["stone.stairs"] as string, {
        facing: towards,
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      });
      // Every other bay carries the light. Standing, on the cap under it.
      if (bay % 2 === 1) {
        c.raw(cell.x, capY + 1, cell.z, "lantern", { hanging: "false", waterlogged: "false" });
      }
    }
  }

  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    vault(ctx, c, roof);
  }

  // --- the powder ------------------------------------------------------------
  // Barrels down both long walls, the middle of the floor left clear, and not
  // one lit block indoors.
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  for (let z = it.z0; z <= it.z1; z++) {
    for (const x of [it.x0, it.x1]) {
      if (x === lamp.x && z === lamp.z) continue;
      if ((z - it.z0) % 4 === 3) continue; // the gangway between ranks
      c.put1(x, z, "barrel", { facing: "up", open: "false" });
    }
  }
  // The ready rack at the far end: a shot pile, which is the one thing in the
  // room that says what the barrels are for.
  const end = farEnd(ctx);
  const mid = Math.floor((it.x0 + it.x1) / 2);
  if (mid !== lamp.x || end.z !== lamp.z) {
    if (c.put1(mid, end.z, "polished_blackstone")) {
      c.stack(mid, end.z, 2, "polished_blackstone_slab", { type: "bottom", waterlogged: "false" });
    }
  }
}

/**
 * The barrel vault: an arc over the long axis, closed at both ends.
 *
 * Written as a **shell** rather than a solid mass — a filled roof of this size
 * is a thousand blocks nobody sees the inside of — and the shell is safe
 * because it is an *arc*: a cell is written only where the cell beside it on
 * the same course, or the cell under it, is written too, so the
 * `floating.isolated` rule has nothing to find. The ellipse test is integer
 * throughout (`dx² · H² + k² · W² ≤ W² · H²`), which is rule 7 met without a
 * square root anywhere.
 */
function vault(ctx: FitOutContext, c: PropCounter, plan: CorsairPlan): void {
  const h = plan.top - plan.base;
  if (h < 1) return;
  const stone = ashlar(ctx);
  // The arithmetic runs in **halves**, so an even span has no false centre:
  // `dx2` is twice the offset from the axis and `w2` twice the half-width, and
  // the ellipse test is scaled to match. Integers all the way down, which is
  // rule 7 met without a square root anywhere.
  const w2 = plan.sx - 1;
  const inside = (dx2: number, k: number): boolean =>
    dx2 * dx2 * h * h + k * k * w2 * w2 <= w2 * w2 * h * h;
  for (let k = 0; k <= h; k++) {
    const y = plan.base + k;
    if (y > plan.top) break;
    for (let z = 0; z < plan.sz; z++) {
      const gableEnd = z === 0 || z === plan.sz - 1;
      for (let x = 0; x < plan.sx; x++) {
        const dx2 = 2 * x - w2;
        if (!inside(dx2, k)) continue;
        // The shell: the surface of the arc, plus everything at the two gable
        // ends, which is what closes the barrel instead of leaving a tube.
        const surface = !inside(dx2, k + 1) || !inside(dx2 - 2, k) || !inside(dx2 + 2, k);
        if (!gableEnd && !surface) continue;
        c.raw(x, y, z, stone(x, y, z));
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the sea tower                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `martello_tower` — the squat round gun tower on the mole.
 *
 * A round tower out of a rectangular shell is the hard problem this file has,
 * and the honest answer is the one every mason gave before concrete: **you
 * chamfer it**. Four moves, in the order they are written:
 *
 * 1. **the batter** — the apron carries two solid courses all round and three
 *    at the corners, footed to the ground course, so the tower's foot swells
 *    outward the way a battered wall does and the plan stops reading as a box
 *    at eye level;
 * 2. **the chamfer** — the four corner columns of the footprint are cut away
 *    above the batter, which turns a square drum into an octagonal one. The
 *    interior is inset one cell, so a corner column is diagonal to the room
 *    and cutting it opens no wall a body could walk through; a column with a
 *    door, a window or anything else on the preserve list in it is skipped
 *    whole, because a door is taller than its door block;
 * 3. **the platform** — the roof comes off, a lid goes down, and a parapet
 *    stands on the lid: an octagonal ring of masonry with merlons on every
 *    other cell. Every parapet block sits on the lid, which is rule 3 obeyed
 *    rather than argued with;
 * 4. **the gun** — one, on the platform, pointing out over the door's face,
 *    because that is the direction the tower is looking. It is the difference
 *    between a tower and a *sea* tower.
 *
 * The ladder at first-floor height is the curator's note's last clause, and it
 * is the exterior one: it climbs the apron beside the door, on the wall cells
 * that are actually solid at every course it passes — an unsupported ladder is
 * the physics lint's oldest finding and it is not being re-earned here.
 */
function fitMartelloTower(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const stone = ctx.style["foundation.primary"] as string;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, masonry(ctx));

    // --- the batter ---------------------------------------------------------
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const corner =
        (cell.x === -1 || cell.x === wall.sx) && (cell.z === -1 || cell.z === wall.sz);
      footing(ctx, c, cell.x, cell.z, stone);
      c.raw(cell.x, 1, cell.z, stone);
      c.raw(cell.x, 2, cell.z, stone);
      if (corner) c.raw(cell.x, 3, cell.z, stone);
    }

    // --- the chamfer --------------------------------------------------------
    for (const [x, z] of [
      [0, 0],
      [wall.sx - 1, 0],
      [0, wall.sz - 1],
      [wall.sx - 1, wall.sz - 1],
    ] as const) {
      if (columnProtected(ctx, x, z)) continue;
      if (onWayIn(ctx, x, z)) continue;
      for (let y = 4; y <= ctx.wallTop; y++) c.raw(x, y, z, "air");
    }

    ladderUp(ctx, c, wall);
  }

  // **One course of allowance is enough here**, unlike everywhere else in this
  // file: the platform is a lid and a parapet, and a parapet standing on a lid
  // needs exactly two courses. `roofPlan`'s stricter two-course test is the
  // vault's, which has an arc to draw.
  const roof = wallPlan(ctx);
  if (roof !== null && roof.top - roof.base >= 1) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    // --- the parapet --------------------------------------------------------
    const merlon = ctx.style["foundation.accent"] as string;
    let i = 0;
    for (const cell of ringOf(roof.sx, roof.sz)) {
      const corner =
        (cell.x === 0 || cell.x === roof.sx - 1) && (cell.z === 0 || cell.z === roof.sz - 1);
      if (corner) continue; // the platform is chamfered too
      c.raw(cell.x, roof.base + 1, cell.z, stone);
      if (i % 2 === 0 && roof.base + 2 <= roof.top) {
        c.raw(cell.x, roof.base + 2, cell.z, merlon);
      }
      i++;
    }
    // --- the gun ------------------------------------------------------------
    // Amidships on the platform, looking the way the door does.
    const facing: Cardinal = ctx.door === null ? "south" : ctx.door.face;
    const [dx, dz] = cardinalStep(facing);
    const gx = Math.floor((roof.sx - 1) / 2) - dx;
    const gz = Math.floor((roof.sz - 1) / 2) - dz;
    if (gx >= 1 && gx <= roof.sx - 2 && gz >= 1 && gz <= roof.sz - 2) {
      gun(c, gx, roof.base + 1, gz, facing);
    }
  }

  // --- the gun floor ---------------------------------------------------------
  // A magazine hatch and shot in the middle of the drum, and nothing else: the
  // room in a martello tower is a store with a garrison sleeping in it.
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
      if (x === lamp.x && z === lamp.z) continue;
      c.put1(x, z, "barrel", { facing: "up", open: "false" });
    }
  }
  const mid = Math.floor((it.x0 + it.x1) / 2);
  if (mid !== lamp.x || end.z !== lamp.z) c.put1(mid, end.z, "polished_blackstone");
}

/**
 * The exterior ladder, up the apron beside the door.
 *
 * Placed one bay along the wall from the doorstep, never in it, and only on
 * the courses where the wall cell it brackets to is genuinely there: the shell
 * puts windows, shutters and its own doorstep awning in that wall, and a
 * ladder fixed to a pane is `unsupported.ladder`. The run stops at the first
 * course that cannot carry it rather than skipping over the hole, because a
 * ladder with a gap in it is a ladder you fall off.
 */
function ladderUp(ctx: FitOutContext, c: PropCounter, plan: CorsairPlan): void {
  if (ctx.door === null) return;
  const face = ctx.door.face;
  const [dx, dz] = cardinalStep(face);
  // One step along the wall from the doorstep — the perpendicular of the door's
  // own outward step.
  for (const side of [1, -1]) {
    const wx = ctx.door.x + dz * side;
    const wz = ctx.door.z + dx * side;
    if (wx < 0 || wx > plan.sx - 1 || wz < 0 || wz > plan.sz - 1) continue;
    if (columnProtected(ctx, wx, wz)) continue;
    const lx = wx + dx;
    const lz = wz + dz;
    for (let y = 1; y <= ctx.wallTop; y++) {
      const behind = ctx.blockAt(wx, y, wz);
      if (behind === undefined || behind.block === "air") break;
      c.raw(lx, y, lz, "ladder", { facing: face, waterlogged: "false" });
    }
    return;
  }
}

/* -------------------------------------------------------------------------- */
/* the chandlery                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `chandlery` — the shop that sells a voyage.
 *
 * The note is a *list of goods*, and a list of goods is an interior. So the
 * building spends its exterior budget on the one move that says "shop" from
 * the street — **the awning**, a run of open trapdoors hinged along the wall
 * over the door's face, which is the same block a shutter is and the same
 * support argument (each one brackets to the wall behind it) — and everything
 * else goes inside:
 *
 * - **the counter**, a run of masonry with slabs on it down the far end, with
 *   the shopkeeper's side left clear;
 * - **the goods**: barrels of tar and salt beef in the corners, cauldrons of
 *   pitch, and coils of rope laid out as carpet on the floor plane, which is
 *   the only way a coil of rope is a block;
 * - **the light**: `glowstone` bracketed against the shelving rather than a
 *   hanging lantern. The lint's rule fires on the *name*, so the safe glow in
 *   a room with a low ceiling is a full cube with masonry beside it.
 */
function fitChandlery(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const it = ctx.interior;
  const lamp = lanternColumn(it);

  if (wall !== null) {
    // --- the awning ---------------------------------------------------------
    // Over the door's face, at head height, hinged to the wall behind it.
    const face: Cardinal = ctx.door === null ? "south" : ctx.door.face;
    const [dx, dz] = cardinalStep(face);
    const y = Math.max(2, Math.min(ctx.wallTop - 1, 4));
    // Along the face and never round the corner: a run that turns a corner is
    // two awnings meeting in mid air.
    const cells =
      dz !== 0
        ? Array.from({ length: Math.max(0, wall.sx - 2) }, (_, i) => ({
            x: i + 1,
            z: dz < 0 ? 0 : wall.sz - 1,
          }))
        : Array.from({ length: Math.max(0, wall.sz - 2) }, (_, i) => ({
            x: dx < 0 ? 0 : wall.sx - 1,
            z: i + 1,
          }));
    for (const cell of cells) {
      // **Never over the way in**, and the reason is the decay rather than the
      // walk: the door column and its step are the one place the ruin sweep
      // refuses to settle fixtures (they are what the walking agent starts
      // from), so a leaf hung there is a leaf that survives the wall behind it
      // — `spruce_trapdoor @6,4,15 anchor=air`, found by the catalog-wide
      // orphan sweep the first time this awning ran.
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const behind = ctx.blockAt(cell.x, y, cell.z);
      if (behind === undefined || behind.block === "air") continue;
      c.raw(cell.x + dx, y, cell.z + dz, ctx.style["wall.trapdoor"] as string, {
        facing: opposite(face),
        half: "top",
        open: "true",
        powered: "false",
        waterlogged: "false",
      });
    }
  }

  // --- the counter -----------------------------------------------------------
  const end = farEnd(ctx);
  const stone = ctx.style["foundation.accent"] as string;
  const slab = ctx.style["stone.slab"] as string;
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x && end.z === lamp.z) continue;
    if ((x - it.x0) % 4 === 3) continue; // the way behind the counter
    if (c.put1(x, end.z, stone)) {
      c.stack(x, end.z, 2, slab, { type: "bottom", waterlogged: "false" });
    }
  }

  // --- the goods -------------------------------------------------------------
  const near = end.z === it.z0 ? it.z1 : it.z0;
  const shelfZ = end.z === it.z0 ? it.z0 + 1 : it.z1 - 1;
  for (let z = Math.min(shelfZ, near); z <= Math.max(shelfZ, near); z++) {
    for (const x of [it.x0, it.x1]) {
      if (x === lamp.x && z === lamp.z) continue;
      const roll = tideJitter(x, 1, z, 4);
      if (roll === 0) {
        // A `cauldron` and not a `water_cauldron`: the empty one is the block
        // with no properties at all, and the pitch in it is a fiction the
        // walker supplies.
        c.put1(x, z, "cauldron");
        continue;
      }
      if (roll === 1) {
        // The shelving, and the glow that rides it: a full cube standing on the
        // crate under it, with the wall beside it. Never a hanging lantern.
        if (c.put1(x, z, "barrel", { facing: "up", open: "false" })) {
          c.stack(x, z, 2, "glowstone");
        }
        continue;
      }
      c.put1(x, z, "barrel", { facing: "up", open: "false" });
    }
  }
  // The rope, coiled on the floor: carpet is the only coil the medium has, and
  // it stands on the floor plane, which is what keeps it off the support rules.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    const x = Math.floor((it.x0 + it.x1) / 2);
    if (x === lamp.x && z === lamp.z) continue;
    c.put1(x, z, tideJitter(x, 0, z, 2) === 0 ? "brown_carpet" : "white_carpet");
  }
}

/* -------------------------------------------------------------------------- */
/* the sail loft                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `sail_loft` — one long clear floor with the canvas laid out on it.
 *
 * The read is **the hoist**, and it is the only thing in this building visible
 * from the harbour: a beam of two log blocks cantilevered out of the gable
 * over a hoist door, with a fall of bars hanging off the end of it. Both
 * halves earn their support honestly — the beam's blocks touch the wall and
 * each other, and `iron_bars` is not a full cube and not on the ground-chain
 * list, so a fall hanging off a beam is a fall, not a finding. (`chain` would
 * be the obvious block and is **not in the pinned 1.21.11 table**; the whole
 * repo uses bars for rigging and so does this.)
 *
 * Inside, the note's "one long clear upper floor with the cloth laid out on
 * it" is taken literally, and the *clear* is the load-bearing word:
 *
 * - when the building has an upper storey, the cloth goes on **it** — carpet
 *   in the floor plane of the loft, which is passable, leaves the storey one
 *   walkable region, and (because the generic upper-floor pass reads a cell
 *   with something in it as unusable) means nothing else ever gets stacked up
 *   there. A loft full of beds is not a loft;
 * - when it has one storey, the same cloth is laid on the ground floor's far
 *   half and the seam benches go down the walls.
 */
function fitSailLoft(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const it = ctx.interior;
  const lamp = lanternColumn(it);

  if (wall !== null) hoist(ctx, c, wall);

  // --- the seam benches ------------------------------------------------------
  // Down both long walls, facing into the room: a stair's `facing` is the
  // direction of its high half, so a bench against the west wall faces west.
  const bench = ctx.style["stair.interior"] as string;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 === 0) continue;
    for (const [x, facing] of [
      [it.x0, "west"],
      [it.x1, "east"],
    ] as const) {
      if (x === lamp.x && z === lamp.z) continue;
      c.put1(x, z, bench, { facing, half: "bottom", shape: "straight", waterlogged: "false" });
    }
  }

  // --- the cloth -------------------------------------------------------------
  const cloths = ["white_carpet", "light_gray_carpet", "white_carpet"] as const;
  const level = ctx.floors > 1 ? ctx.storyHeight : 0;
  if (level > 0) {
    // The loft. Written straight into the storey's own plane, where a cell is
    // floor and the two courses over it are clear — the same test the generic
    // upper-floor pass makes, made before it runs, so the storey it then sees
    // is the walkway and nothing else ever gets stacked on the cloth.
    //
    // **The cloth is the inner rect and the walk is the ring round it**, which
    // is not a decorative choice: the upper-storey guard asks that every cell
    // of the floor that is not built on stays ONE region, and a cloth laid in
    // a seeded scatter leaves a walkway of islands. A ring is a cycle, so it
    // survives the stairwell landing wherever the flight put it.
    for (const cell of ctx.floorCells) {
      if (cell.x <= it.x0 || cell.x >= it.x1 || cell.z <= it.z0 || cell.z >= it.z1) continue;
      if (ctx.blockAt(cell.x, level, cell.z) === undefined) continue;
      if (ctx.blockAt(cell.x, level + 1, cell.z) !== undefined) continue;
      if (ctx.blockAt(cell.x, level + 2, cell.z) !== undefined) continue;
      const roll = tideJitter(cell.x, level, cell.z, 8);
      c.raw(cell.x, level + 1, cell.z, cloths[roll % cloths.length] as string);
    }
  } else {
    const end = farEnd(ctx);
    const from = end.z === it.z0 ? it.z0 : Math.floor((it.z0 + it.z1) / 2);
    const to = end.z === it.z0 ? Math.floor((it.z0 + it.z1) / 2) : it.z1;
    for (let z = from; z <= to; z++) {
      for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
        if (x === lamp.x && z === lamp.z) continue;
        const roll = tideJitter(x, 0, z, 8);
        if (roll >= 6) continue;
        c.put1(x, z, cloths[roll % cloths.length] as string);
      }
    }
  }

  // --- the bolts of cloth ----------------------------------------------------
  // Wool, stacked at the end away from the cutting floor: the one block in the
  // room that says what the carpet is.
  const near = ctx.door === null ? it.z1 : ctx.door.z > (it.z0 + it.z1) / 2 ? it.z1 : it.z0;
  for (let x = it.x0 + 1; x <= it.x1 - 1; x += 2) {
    if (x === lamp.x && near === lamp.z) continue;
    c.put1(x, near, tideJitter(x, 1, near, 3) === 0 ? "light_gray_wool" : "white_wool");
  }
}

/**
 * The hoist: a beam out of the gable, a door under it, a fall off the end.
 *
 * The gable face is the one **opposite the door**, so the hoist swings over
 * the lane rather than over the way in, and the whole assembly is refused
 * outright when the wall it would cantilever from is not solid — a beam that
 * starts in a window is a beam starting in air.
 */
function hoist(ctx: FitOutContext, c: PropCounter, plan: CorsairPlan): void {
  const face: Cardinal = ctx.door === null ? "south" : opposite(ctx.door.face);
  const [dx, dz] = cardinalStep(face);
  const y = Math.max(2, ctx.wallTop - 1);
  const along = dz !== 0 ? plan.sx : plan.sz;
  const mid = Math.floor((along - 1) / 2);
  // **The bay is searched, not assumed.** The obvious column is the middle of
  // the gable, and the shell puts a window there about half the time — the
  // first version simply gave up when it did, and a sail loft with no hoist is
  // a shed. So the bays either side are tried in turn, and only a gable with
  // nothing solid anywhere along it goes without.
  let at = -1;
  for (const offset of [0, 1, -1, 2, -2]) {
    const i = mid + offset;
    if (i < 1 || i > along - 2) continue;
    const cx = dz !== 0 ? i : dx < 0 ? 0 : plan.sx - 1;
    const cz = dx !== 0 ? i : dz < 0 ? 0 : plan.sz - 1;
    if (columnProtected(ctx, cx, cz)) continue;
    const standing = ctx.blockAt(cx, y, cz);
    if (standing === undefined || standing.block === "air") continue;
    at = i;
    break;
  }
  if (at < 0) return;
  const wx = dz !== 0 ? at : dx < 0 ? 0 : plan.sx - 1;
  const wz = dx !== 0 ? at : dz < 0 ? 0 : plan.sz - 1;

  // The beam: **one** block, cantilevered into the apron and touching the wall
  // it comes out of. One and not two, because the apron is one cell wide and
  // the envelope rule is the envelope rule — a beam that reached two cells out
  // would be a beam outside the building's own box.
  const log = ctx.style["wall.accent"] as string;
  c.raw(wx + dx, y, wz + dz, log, { axis: dz !== 0 ? "z" : "x" });
  // The fall: bars off the end of the beam. Not a full cube and not on the
  // ground-chain list, so a fall hanging in air is a fall; every link touches
  // the one over it, and the top one touches the beam.
  for (let k = 1; k <= 3; k++) {
    c.raw(wx + dx, y - k, wz + dz, "iron_bars", {
      north: "false",
      south: "false",
      east: "false",
      west: "false",
      waterlogged: "false",
    });
  }
  // The hoist door: two leaves standing proud of the gable either side of the
  // fall, each hinged on the wall cell behind it. **The wall is not cut**, and
  // that is deliberate — an opening at head height in the one face with no
  // floor behind it is a hole to fall out of, and the leaves read as a loading
  // door whether or not there is a hole under them.
  for (const side of [1, -1]) {
    const jx = wx + dz * side;
    const jz = wz + dx * side;
    if (jx < 0 || jx > plan.sx - 1 || jz < 0 || jz > plan.sz - 1) continue;
    const jamb = ctx.blockAt(jx, y - 1, jz);
    if (jamb === undefined || jamb.block === "air") continue;
    c.raw(jx + dx, y - 1, jz + dz, ctx.style["wall.trapdoor"] as string, {
      facing: opposite(face),
      half: "top",
      open: "true",
      powered: "false",
      waterlogged: "false",
    });
  }
}
