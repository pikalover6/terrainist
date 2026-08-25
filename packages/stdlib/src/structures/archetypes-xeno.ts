/**
 * The **alien & sci-fi pack**, organic half — three buildings that were
 * *grown*.
 *
 * `docs/CATALOG-EXPANSION-v0.md` §3.4 exists because an invasion needs fabric:
 * a world whose only alien thing is the landmark reads as a museum. This file
 * is the half of that pack a stranger names the prompt by from a street corner
 * — the hive itself — plus the one human building the P4 hideout needs in
 * order to eat:
 *
 * - **the hive** — `xeno_spire` (the headline), `hive_mound`;
 * - **what the survivors live on** — `hydroponics_bay`.
 *
 * `archetypes-sanctum.ts` and `archetypes-classical.ts` state the law this
 * file obeys, so it is not restated: an archetype is a **fit-out**, not a
 * second grammar. Everything here runs after the shape stages and writes into
 * the same cell map, so a xeno spire is the shell wearing a shell. Not one
 * line of `core.ts` moves for any of it.
 *
 * ## The one thing this pack must get right
 *
 * **The spire has to read as GROWN, not built.** A tapering tower is a
 * steeple; a tapering tower whose axis *wanders* as it climbs, whose section
 * is never quite round and whose surface is fibrous rather than coursed, is a
 * thing that came out of the ground. So the two hive buildings spend their
 * whole budget on the volume between the eave plate and
 * `roofTop + `{@link ROOF_FLOURISH_RISE}, and the interiors are furnished with
 * what is left.
 *
 * The organic accents here are **fixed blocks, not style roles**, and that is
 * deliberate: a hive's shell is its own, not the town's. `nether_wart_block`,
 * `warped_wart_block`, `crimson_stem`, `sculk` and `shroomlight` come out the
 * same in `temperate_timber` as in the new `xeno_resin` palette, so the icon
 * survives a document that never names a theme at all. What the theme changes
 * is the *ground* the hive stands on — the foundation roles are still the
 * town's.
 *
 * ## The rules, inherited whole from the classical and sanctum packs
 *
 * 1. **Nothing leaves the envelope** — the footprint plus its one-block apron,
 *    and `roofTop + `{@link ROOF_FLOURISH_RISE} overhead.
 * 2. **The interior stays walkable**: every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take`.
 * 3. **Solid per course, never a ring per course.** The spire's stalk and the
 *    mound's dome are both *solid* cross-sections, and the axis drifts by at
 *    most one cell per step, so every course overlaps the one under it. A
 *    stepped shell built as a ring is the floating rule waiting to happen.
 * 4. **A rebuilt roof starts with a lid**, because the room below needs a
 *    ceiling and everything above needs a floor.
 * 5. **A tunnel mouth is a place a body fits.** The mound cuts two extra ways
 *    in beside the shell's door, and each one is air at `y = 1` **and**
 *    `y = 2` on both sides of the wall, with the ground course filled under
 *    the apron cell — a mouth you cannot stand in is a texture, not a door.
 * 6. **No interior column runs floor to ceiling.** Every rack, rib and pod
 *    goes through {@link PropCounter}, whose headroom guard is the physics
 *    lint's `interior.blocked_column` rule.
 * 7. **No transcendental maths.** The dome and the stalk are integer squared
 *    tests in ten-thousandths; there is no sine anywhere in the pack.
 * 8. **No unseeded randomness.** There is no RNG in a fit-out context, and
 *    this file does not want one: {@link organicJitter} is a pure integer hash
 *    of the position or the envelope, which is the idiom every earlier wave
 *    uses and is what makes "the same spec compiles to the same spire forever"
 *    true by construction rather than by test.
 * 9. No bare `flower_pot`, no sign blocks, no lit fire.
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
 * The three archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts` immediately after the
 * classical Mediterranean pack, and repeated in that order in the spec's
 * `KNOWN_BUILDING_ARCHETYPES`, where the order is asserted.
 */
export const XENO_BUILDING_ARCHETYPES = ["xeno_spire", "hive_mound", "hydroponics_bay"] as const;

/** One of the archetypes this file fits out. */
export type XenoBuildingArchetype = (typeof XENO_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isXenoArchetype(value: string): value is XenoBuildingArchetype {
  return (XENO_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after the classical table, where every later wave
 * sits, and for the same reason: the tables below it are greedy. The
 * non-claims matter more than the claims here, because this pack's vocabulary
 * is *adjectival* and adjectives are exactly what must not outrank nouns:
 *
 * - **`spire` is not ours.** The garrison's `beacon_spire` claimed the bare
 *   word long before this pack existed, and an id is not a vocabulary: a
 *   document that says `spire` gets the beacon, and the hive's answers to
 *   `xeno_spire`, `xeno`, `alien_spire`, `hive_spire` and `xeno_tower`. The
 *   same situation the classical pack's `odeon` is in;
 * - **`greenhouse` is not ours** — it is the blitz wave's, and a glasshouse
 *   full of tomatoes is what a document asking for one wants. The
 *   hydroponics bay takes `hydroponics`, `hydroponic`, `hydroponics_bay`,
 *   `grow_house` and `vertical_farm`, and leaves `farm`, `garden` and
 *   `botanical_garden` where they were;
 * - **bare `alien` is deliberately unclaimed here.** It is the *pack's* word,
 *   not one building's — a node tagged `alien` in a street of barricades and
 *   crash furrows should not silently become a spire. It reaches the palette
 *   instead, through the compiler's `THEME_ALIASES`, which is the layer an
 *   adjective belongs in;
 * - **bare `mound` is left alone**: a mound is a barrow as often as it is a
 *   hive, and the relic pack's `burial_mound` is what a document that says it
 *   usually means. The hive takes `hive`, `hive_mound`, `alien_hive`,
 *   `brood_mound` and `hive_nest`;
 * - **`mech`, `derelict_mech` and `bio_pod` are claimed by nobody**, on
 *   purpose. They name this pack's two **props**, which are reached by name
 *   and never through this cascade; claiming them here would make a node
 *   tagged `mech` build a *building*, which is worse than it not resolving.
 */
export function xenoArchetypeOfTags(tags: readonly string[]): XenoBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (
    has("xeno_spire") ||
    has("xeno") ||
    has("alien_spire") ||
    has("hive_spire") ||
    has("xeno_tower")
  ) {
    return "xeno_spire";
  }
  if (
    has("hive_mound") ||
    has("hive") ||
    has("alien_hive") ||
    has("brood_mound") ||
    has("hive_nest")
  ) {
    return "hive_mound";
  }
  if (
    has("hydroponics_bay") ||
    has("hydroponics") ||
    has("hydroponic") ||
    has("grow_house") ||
    has("vertical_farm")
  ) {
    return "hydroponics_bay";
  }
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's — defaults a caller merges, never
 * something applied over an explicit param.
 *
 * The two hive buildings ask for `windowRhythm: "none"` and `roof: "hip"`. The
 * rhythm because **a hive has no windows**: it has seams where the shell
 * parted, and this file cuts those itself, so a regular rank of glass would be
 * the one thing that made the spire read as a tower with an alien paint job.
 * The roof because `hip` leaves the most room between the eave plate and the
 * allowance, and that gap is where the whole silhouette is built.
 *
 * The hydroponics bay is the opposite building and asks for the opposite
 * facade: as much glass as the wall allows, under a plain gable. Its icon is
 * *inside* — racks, lamps and a tank — so the shell's job is to let the glow
 * out.
 */
export function xenoFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "xeno_spire":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "hive_mound":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "hydroponics_bay":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
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
 * The classical pack's `ClassicalPlan` in every respect, restated rather than
 * imported for the reason that pack restated the sanctum's: two packs are two
 * seams, and a shared private helper is a shared edit. The refusals are the
 * same — a **plain rect** only, and two courses of room over the plate before
 * a roof may be rebuilt.
 */
interface XenoPlan {
  /** Envelope extents. */
  readonly sx: number;
  readonly sz: number;
  /** Y of the roof's lowest course — one above the eave plate. */
  readonly base: number;
  /** Highest Y anything may occupy: the shell's roof top plus the allowance. */
  readonly top: number;
  /** The footprint, as an inclusive rect. */
  readonly rect: LocalRect;
}

/** The plan for work on the **walls**: the rect condition, and nothing else. */
function wallPlan(ctx: FitOutContext): XenoPlan | null {
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
function roofPlan(ctx: FitOutContext): XenoPlan | null {
  const plan = wallPlan(ctx);
  if (plan === null) {
    ctx.skipped?.push("roof work: the interior is not the one-block inset the rebuild plans over");
    return null;
  }
  const courses = plan.top - plan.base;
  if (courses < 2) {
    ctx.skipped?.push(
      `roof work: ${courses} course${courses === 1 ? "" : "s"} above the eave where the rebuild needs 2 — a flat or low roof leaves no room`,
    );
    return null;
  }
  return plan;
}

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: XenoPlan): void {
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
 * The classical pack's list unchanged: the way in, the way up, the fire, the
 * glass and anything the physics lint holds to a support rule.
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
 * **A door is taller than its door block**, and the classical pack paid a
 * sweep to learn it: cutting the courses over a door leaves the shell's little
 * doorstep awning hanging on nothing. Every seam and every tunnel mouth in
 * this file therefore skips the whole column a protected block stands anywhere
 * in.
 */
function columnProtected(ctx: FitOutContext, x: number, z: number): boolean {
  for (let y = 1; y <= ctx.wallTop; y++) if (protectedAt(ctx, x, y, z)) return true;
  return false;
}

/**
 * May this wall column be **cut away** — not merely re-clad, but removed?
 *
 * A stricter question than {@link columnProtected}, and it has to be, because
 * cutting is destructive in three directions at once. Everything a seam or a
 * tunnel mouth takes out was carrying something, and the theme sweep found two
 * of the three the hard way:
 *
 * 1. **the column itself** — anything {@link PRESERVE} names, the classical
 *    pack's list unchanged;
 * 2. **what is hung on its outside.** The shell hangs *shutters* beside its
 *    windows, in the apron, and a shutter is a trapdoor: not a full cube, not
 *    on the preserve list, and attached to the very wall cell a seam deletes.
 *    Cutting a window column left birch trapdoors hanging on nothing at
 *    `-1,6,2`. So the apron and interior cells beside the column are scanned
 *    for a trapdoor too, and one anywhere in reach refuses the whole column;
 * 3. **what leans on its inside.** The shell's stair flight climbs the west
 *    column and its steps take support from the wall behind them; a seam cut
 *    up that face left `spruce_stairs at 1,4,5` in mid air. `ctx.free` is the
 *    ground floor's own guard and already knows where the flight, the hearth
 *    and the door reserve are, so asking it is one call rather than a second
 *    opinion about any of them.
 */
function cuttable(ctx: FitOutContext, x: number, z: number, inward: readonly [number, number]): boolean {
  if (columnProtected(ctx, x, z)) return false;
  if (onWayIn(ctx, x, z)) return false;
  // The cell inside must be floor a body can stand on, which is what makes the
  // flight's column and the hearth's answer "no" without naming either.
  if (!ctx.free(x + inward[0], z + inward[1])) return false;
  // Nothing hung on either face of it, at any height.
  for (let y = 1; y <= ctx.wallTop; y++) {
    for (const [dx, dz] of [[0, 0], inward, [-inward[0], -inward[1]]] as const) {
      const at = ctx.blockAt(x + dx, y, z + dz);
      if (at !== undefined && /_trapdoor$/.test(at.block)) return false;
    }
  }
  return true;
}

/**
 * A deterministic small draw, keyed on whatever the caller hands it.
 *
 * There is no RNG in a {@link FitOutContext} and this file does not want one:
 * a position-derived integer hash is the idiom every earlier wave uses, it is
 * a pure function, and it makes "the same document compiles to the same spire
 * forever" true by construction. `Math.imul` is exactly specified by IEEE-754
 * where `Math.pow` is not, which is why the mix is written with it.
 */
function organicJitter(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/* -------------------------------------------------------------------------- */
/* the hive's own materials                                                    */
/* -------------------------------------------------------------------------- */

/** The shell's body — deep red fibre, the surface everything else sits in. */
const CHITIN = "nether_wart_block";
/** The other strain, used as a mottle so the shell is never one flat colour. */
const RESIN = "warped_wart_block";
/** The rib: a stem, and the one block here that carries an axis. */
const RIB = "crimson_stem";
/** The stain a hive leaves on whatever it grew over. */
const STAIN = "sculk";
/** The glow. Always on, and never a fire — nothing in this file is lit. */
const GLOW = "shroomlight";
/** A stem, standing. The only property any of these blocks needs. */
const UPRIGHT: Record<string, string> = { axis: "y" };

/** The six faces a block can be touched on. */
const FACES: readonly (readonly [number, number, number])[] = Object.freeze([
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const);

/**
 * Does anything already written touch this cell?
 *
 * `ctx.blockAt` reads the **live** cell map — the same map `ctx.put` writes
 * into — so this sees what this fit-out has built as well as what the shell
 * left, and an unwritten cell reads as air, which is the conservative
 * direction.
 */
function touched(ctx: FitOutContext, x: number, y: number, z: number): boolean {
  for (const [dx, dy, dz] of FACES) {
    const n = ctx.blockAt(x + dx, y + dy, z + dz);
    if (n !== undefined && n.block !== "air") return true;
  }
  return false;
}

/**
 * Write a lit block, **or write nothing**.
 *
 * THE GLOW RIDES THE STRUCTURE. Every light in this file is a full cube, and
 * the physics lint's `floating.isolated` rule polices a full cube with air on
 * all six faces — so a light is only ever placed where the shell it belongs to
 * is already touching it. Called *after* whatever cutting the surrounding move
 * does, so what it checks is the finished state rather than an intention.
 *
 * This exists because the theme sweep found a `shroomlight` hanging two
 * courses over a brood pod with a clear cell between them: right on paper,
 * isolated in the world. One guard on one entry point is the answer, rather
 * than five call sites each remembering to look down.
 */
function lit(ctx: FitOutContext, c: PropCounter, x: number, y: number, z: number): boolean {
  if (!touched(ctx, x, y, z)) return false;
  c.raw(x, y, z, GLOW);
  return true;
}

/**
 * The shell surface at a cell — chitin, mottled with resin and ribbed.
 *
 * A pure function of position, so opposite flanks agree and two courses of the
 * same stalk never disagree about what they are made of. The mottle is what
 * stops a solid taper reading as a poured cone.
 */
function shell(x: number, y: number, z: number): { block: string; props?: Record<string, string> } {
  const roll = organicJitter(x, y, z, 12);
  if (roll === 0) return { block: RIB, props: UPRIGHT };
  if (roll <= 2) return { block: RESIN };
  if (roll === 3) return { block: STAIN };
  return { block: CHITIN };
}

/** Write the shell at a cell, counted. */
function shellAt(c: PropCounter, x: number, y: number, z: number): void {
  const s = shell(x, y, z);
  c.raw(x, y, z, s.block, s.props);
}

/**
 * Re-clad the wall ring between two courses in the hive's own shell.
 *
 * Same contract as the classical pack's `reclad`: protected cells are skipped,
 * everything else is overwritten, and the block is a pure function of position.
 */
function encase(ctx: FitOutContext, c: PropCounter, plan: XenoPlan, yFrom: number, yTo: number): void {
  for (const cell of ringOf(plan.sx, plan.sz)) {
    for (let y = yFrom; y <= yTo; y++) {
      if (protectedAt(ctx, cell.x, y, cell.z)) continue;
      shellAt(c, cell.x, y, cell.z);
    }
  }
}

/**
 * A solid lid over the whole footprint at the roof's first course.
 *
 * Rule 4, and the reason it is a named function: `clearRoof` takes the shell's
 * roof away, and the room below needs a ceiling while everything above needs a
 * floor to stand on.
 */
function lid(c: PropCounter, plan: XenoPlan): void {
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) shellAt(c, x, plan.base, z);
  }
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

/**
 * Paint the floor plane where a predicate says so, counting each cell.
 *
 * `y = 0` is the floor itself, so this never takes a cell from the fit-out and
 * never needs the walkability guard — it changes what the floor is made of,
 * not what stands on it.
 */
function floorPaint(
  ctx: FitOutContext,
  c: PropCounter,
  pick: (x: number, z: number) => string | null,
): void {
  for (const cell of ctx.floorCells) {
    const block = pick(cell.x, cell.z);
    if (block === null) continue;
    c.raw(cell.x, 0, cell.z, block);
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
export function furnishXeno(ctx: FitOutContext): number {
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "xeno_spire":
      fitXenoSpire(ctx, c);
      break;
    case "hive_mound":
      fitHiveMound(ctx, c);
      break;
    case "hydroponics_bay":
      fitHydroponicsBay(ctx, c);
      break;
    default:
      return 0;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the hive                                                                    */
/* -------------------------------------------------------------------------- */

/** The four directions the stalk's axis can curl toward, in a fixed cycle. */
const CURL: readonly (readonly [number, number])[] = Object.freeze([
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const);

/** Keep a value inside an inclusive range. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * A seam in the shell — a vertical slit where the plates parted, lit from
 * inside.
 *
 * Never at `y = 1`: the slit starts a course up, so the shell still meets the
 * ground all the way round and the room below is not opened at floor level.
 * The lit cell is at the slit's foot, which is a full block with wall either
 * side of it — no floating, and the glow reads from the street at night.
 */
function seam(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  z: number,
  inward: readonly [number, number],
  height: number,
): void {
  if (!cuttable(ctx, x, z, inward)) return;
  const foot = 2;
  const head = Math.min(ctx.wallTop - 1, foot + height);
  if (head <= foot) return;
  // The slit first, the light after: {@link lit} checks the *finished* state,
  // and a light written before its own slit was cut would be checking a wall
  // that is about to stop existing.
  for (let y = foot + 1; y <= head; y++) c.raw(x, y, z, "air");
  lit(ctx, c, x, foot, z);
}

/**
 * `xeno_spire` — **the headline**: a chitinous mass that tapers, twists and
 * was never drawn with a straight edge.
 *
 * The building grammar hands this file a box with a room in it. A spire that
 * merely re-clad that box would be a tower with an alien paint job, which is
 * the exact failure Troy taught (a right palette on a borrowed form is a
 * borrowed building). So three things happen, in this order:
 *
 * 1. **the box is encased.** The wall ring goes over in shell — chitin mottled
 *    with resin, ribbed with stems on a position hash — and a **flared skirt**
 *    goes round the apron, one course at the flanks and two at the corners, so
 *    the base swells outward the way a growth meets the ground and the plan
 *    stops reading as a rectangle at eye level;
 * 2. **the shell parts.** Vertical seams are cut up the flanks, each lit at
 *    its foot, every one of them going *round* any column the shell put a door
 *    or a pane in. These are the "openings where the shell parted" of the
 *    curator's note, and they are what a hive has instead of windows;
 * 3. **the stalk grows.** Above the plate the roof comes off, a lid goes down,
 *    and a solid mass climbs from it: the section **tapers** to a point, the
 *    axis **curls** a quarter turn as it climbs, and the section itself is a
 *    slightly different oval on every course. Two vents are opened at the
 *    flanks at mid height, each with a lit cell under it, and the apex closes
 *    on a glowing head.
 *
 * The twist is what makes the whole thing work and it is *not* random: the
 * curl's starting quadrant is a hash of the envelope, so two spires on one
 * street lean different ways forever and one spire is the same spire forever.
 *
 * Degrading downward, top-down, the sanctum way: a plan with no room over the
 * plate keeps the encasing and the seams and simply has no stalk, which reads
 * as a young growth rather than as a broken one.
 */
function fitXenoSpire(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    encase(ctx, c, wall, 1, ctx.wallTop);

    // --- the flared skirt ---------------------------------------------------
    // A growth does not meet the ground on a line. The apron carries one
    // course everywhere and two at the corners, which is what turns the
    // silhouette's foot from a plinth into a swelling.
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const corner =
        (cell.x === -1 || cell.x === wall.sx) && (cell.z === -1 || cell.z === wall.sz);
      footing(ctx, c, cell.x, cell.z, ctx.style["foundation.primary"] as string);
      shellAt(c, cell.x, 1, cell.z);
      if (corner) shellAt(c, cell.x, 2, cell.z);
    }

    // --- the seams ----------------------------------------------------------
    // Along both long flanks, at a spacing derived from the envelope so a wide
    // spire gets more of them than a narrow one.
    const step = Math.max(3, Math.floor(wall.sx / 4));
    for (let x = 2; x < wall.sx - 2; x += step) {
      seam(ctx, c, x, 0, [0, 1], 4);
      seam(ctx, c, x, wall.sz - 1, [0, -1], 4);
    }
    const stepZ = Math.max(3, Math.floor(wall.sz / 4));
    for (let z = 2; z < wall.sz - 2; z += stepZ) {
      seam(ctx, c, 0, z, [1, 0], 4);
      seam(ctx, c, wall.sx - 1, z, [-1, 0], 4);
    }
  }

  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(c, roof);
    growStalk(ctx, c, roof, ctx.wallTop);
  }

  // --- the brood floor ------------------------------------------------------
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  floorPaint(ctx, c, (x, z) =>
    organicJitter(x, 0, z, 3) === 0 ? STAIN : null,
  );
  const end = farEnd(ctx);
  const mid = Math.floor((it.x0 + it.x1) / 2);
  // The core: a lit column at the far end, with two pods flanking it. Never in
  // the lantern's own column, which the shell hangs its light in.
  //
  // **The glow sits ON the pod, not over it.** The first version stacked the
  // light two courses up, with a clear cell between, and the theme sweep found
  // it as `floating.isolated`: a full cube with air on all six faces is a
  // finding whether it is a roof step or a light. Course two also lets
  // `stack`'s own headroom guard do the right thing — on a storey too short
  // for a two-block pod it refuses, which is `interior.blocked_column` avoided
  // rather than fought.
  if (end.z !== lamp.z || mid !== lamp.x) {
    if (c.put1(mid, end.z, CHITIN)) c.stack(mid, end.z, 2, GLOW);
  }
  for (const dx of [-2, 2]) {
    const x = mid + dx;
    if (x < it.x0 || x > it.x1) continue;
    if (c.put1(x, end.z, RESIN)) c.stack(x, end.z, 2, GLOW);
  }
  // Ribs down the flanks: a stub off each side wall, two cells apart, every
  // one of them refused by the connectivity guard if it would strand the room.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 3) {
    c.put1(it.x0, z, RIB, UPRIGHT);
    c.put1(it.x1, z, RIB, UPRIGHT);
  }
}

/**
 * The stalk: a solid, tapering, curling mass on the lid.
 *
 * Every course is a filled oval, never a ring (rule 3), and the axis moves by
 * at most one cell per step, so each course overlaps the one below it and no
 * cell anywhere has six air faces. The taper is derived **top-down** — the
 * head takes its point, and whatever is left is the body — so a short envelope
 * yields a shorter spire rather than a spire with no top.
 */
function growStalk(ctx: FitOutContext, c: PropCounter, plan: XenoPlan, wallTop: number): void {
  const h = plan.top - plan.base;
  if (h < 1) return;
  const mx = (plan.sx - 1) >> 1;
  const mz = (plan.sz - 1) >> 1;
  // The foot's half-width: generous, but never the whole footprint — a stalk
  // as wide as the building it stands on is a second storey.
  const r0 = Math.max(1, Math.min(4, (Math.min(plan.sx, plan.sz) - 3) >> 1));
  const spin = organicJitter(plan.sx, plan.sz, wallTop, 4);
  let cx = mx;
  let cz = mz;
  for (let k = 1; k <= h; k++) {
    const y = plan.base + k;
    // The taper, derived from the head down: the last course is a point.
    const r = Math.max(0, r0 - Math.floor((k * (r0 + 1)) / h));
    // The curl: one step every other course, through the cycle, from a
    // starting quadrant that is a hash of the envelope. Three steps of four
    // distinct unit vectors always leave a net lean, which is what guarantees
    // the axis of a full-height spire is not the axis of its base.
    // …but never once the section is a single cell: a one-wide column that
    // steps sideways between courses is a DIAGONAL chain, and a diagonal chain
    // is the floating rule. The axis freezes when the taper runs out, so the
    // point sits straight on the neck it grew from.
    if (k % 2 === 0 && r >= 1) {
      const [dx, dz] = CURL[(spin + (k >> 1)) % CURL.length] as readonly [number, number];
      cx = clamp(cx + dx, r + 1, plan.sx - 2 - r);
      cz = clamp(cz + dz, r + 1, plan.sz - 2 - r);
    }
    // The section: an oval that is never quite the same twice.
    const rx = r;
    const rz = Math.max(0, r - (organicJitter(k, spin, r, 3) === 0 ? 1 : 0));
    for (let dz = -rz; dz <= rz; dz++) {
      for (let dx = -rx; dx <= rx; dx++) {
        if (rx > 0 && rz > 0) {
          const q = (dx * dx * 10000) / (rx * rx) + (dz * dz * 10000) / (rz * rz);
          if (q > 14000) continue;
        }
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || x > plan.sx - 1 || z < 0 || z > plan.sz - 1) continue;
        shellAt(c, x, y, z);
      }
    }
    // The vents: where the shell parted, at mid height and on both flanks.
    if (k === h >> 1 && r >= 2) {
      for (const dx of [-r, r]) {
        const x = cx + dx;
        if (x < 0 || x > plan.sx - 1) continue;
        c.raw(x, y, cz, "air");
        if (y + 1 <= plan.top) c.raw(x, y + 1, cz, "air");
        lit(ctx, c, x, y - 1, cz);
      }
    }
  }
  // The head: whatever the last course came out as, closed with a lit cell —
  // and only when the neck it grew from is really under it. On an envelope
  // with no room for a stalk the shell block stays and the spire simply has an
  // unlit tip, which reads as a young growth rather than as a defect.
  lit(ctx, c, cx, plan.top, cz);
}

/**
 * `hive_mound` — a low resinous dome with three ways in and a vent crown.
 *
 * "Chambered, not roomed" is the curator's note, and it is a note about the
 * *inside*; the outside is one shape. So the roof comes off and goes back as a
 * **half-ellipsoid** — solid per course, drawn from an integer squared test —
 * whose height is taken from the footprint rather than from the allowance, so
 * a mound stays low however much room over the plate the envelope happens to
 * have. That is the whole difference between a mound and a dome-roofed hall.
 *
 * **Three tunnel mouths at ground level.** The shell's own door is one; two
 * more are cut through the flanks, each three columns wide, two courses high,
 * jambed with stems and headed with a chitin lintel — and each one is checked
 * to be *standable*: air at `y = 1` and `y = 2` on both sides of the wall,
 * with the ground course filled under the apron cell it opens onto. A mouth a
 * body cannot walk through is a texture.
 *
 * **The interior stays traversable**, deliberately: the shell reads grown, not
 * decayed, and the "upper chambers may be unreachable if the shell reads
 * decayed" allowance does not apply to a living hive. The chambering is
 * therefore *ribs* — stubs off the side walls, every one of them offered to
 * the connectivity guard, which refuses any that would strand the room — plus
 * a brood floor at the far end. Nowhere is walled off.
 */
function fitHiveMound(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    encase(ctx, c, wall, 1, ctx.wallTop);
    // The skirt, as the spire's — one course all round, so the mound seems to
    // sit *in* the ground rather than on it.
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      footing(ctx, c, cell.x, cell.z, ctx.style["foundation.primary"] as string);
      shellAt(c, cell.x, 1, cell.z);
    }
    // The two extra mouths, on the faces the door is not on — and the face
    // *opposite* the door held in reserve, because a face can refuse (the
    // shell's stair flight stands against one of them) and a mound with two
    // ways in is the entry failing its own note.
    const doorFace = ctx.door === null ? "south" : ctx.door.face;
    const sides: readonly Cardinal[] =
      doorFace === "north" || doorFace === "south" ? ["east", "west"] : ["north", "south"];
    const spare: Cardinal =
      doorFace === "north"
        ? "south"
        : doorFace === "south"
          ? "north"
          : doorFace === "east"
            ? "west"
            : "east";
    let cut = 0;
    for (const face of [...sides, spare]) {
      if (cut >= 2) break;
      if (tunnelMouth(ctx, c, wall, face)) cut++;
    }
  }

  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(c, roof);
    ventCrown(ctx, c, roof, growMound(c, roof));
  }

  // --- the chambering -------------------------------------------------------
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  floorPaint(ctx, c, (x, z) => (organicJitter(x, 1, z, 2) === 0 ? STAIN : null));
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    c.put1(it.x0, z, RIB, UPRIGHT);
    c.put1(it.x1, z, RIB, UPRIGHT);
  }
  // The brood, at the far end and never in the lantern's column.
  const end = farEnd(ctx);
  for (let x = it.x0 + 1; x <= it.x1 - 1; x += 3) {
    if (x === lamp.x && end.z === lamp.z) continue;
    // On the pod, never over it — the spire's lesson, and the same rule.
    if (c.put1(x, end.z, CHITIN)) c.stack(x, end.z, 2, GLOW);
  }
}

/**
 * Cut one standable tunnel mouth through a face of the shell.
 *
 * Three columns wide and two courses high, with stem jambs either side and a
 * chitin lintel over the head. Refused outright when any of the five columns
 * it touches carries something {@link PRESERVE} names, because a mouth that
 * ate half a door is worse than a mound with two mouths.
 */
function tunnelMouth(ctx: FitOutContext, c: PropCounter, plan: XenoPlan, face: Cardinal): boolean {
  const along = face === "north" || face === "south" ? plan.sx : plan.sz;
  /** A wall-ring cell, `k` along the face. */
  const ring = (k: number): { x: number; z: number } => {
    switch (face) {
      case "north":
        return { x: k, z: 0 };
      case "south":
        return { x: k, z: plan.sz - 1 };
      case "east":
        return { x: plan.sx - 1, z: k };
      default:
        return { x: 0, z: k };
    }
  };
  /** One step outward from the face — the apron side. */
  const out: readonly [number, number] =
    face === "north" ? [0, -1] : face === "south" ? [0, 1] : face === "east" ? [1, 0] : [-1, 0];

  const lintel = Math.min(ctx.wallTop - 1, 3);
  if (lintel < 3) return false;

  /**
   * May a mouth be cut centred on `at`?
   *
   * Three refusals, and the third is a scar. The first two are the classical
   * pack's: nothing {@link PRESERVE} names anywhere in the five columns, and
   * nothing on the shell's own way in. The third came out of the theme sweep —
   * **the cell behind the opening must be free floor.** A mouth cut on the
   * face the shell put its stair flight against took the wall out from under
   * a step and left it hanging, which is `floating.stair` exactly. `free` is
   * the ground floor's own guard and already knows where the flight, the
   * hearth and the door reserve are, so the check is one call rather than a
   * second opinion about any of them.
   */
  const clear = (at: number): boolean => {
    if (at - 2 < 0 || at + 2 > along - 1) return false;
    for (let k = at - 2; k <= at + 2; k++) {
      const cell = ring(k);
      // The same destructive-cut guard the seams use: the preserve list, the
      // shutters hung on either face, and the flight leaning on the inside.
      if (!cuttable(ctx, cell.x, cell.z, [-out[0], -out[1]])) return false;
      // …and one cell deeper as well, because a mouth opens onto a *route*,
      // not onto a niche.
      if (!ctx.free(cell.x - out[0] * 2, cell.z - out[1] * 2)) return false;
    }
    return true;
  };

  const mid = (along - 1) >> 1;
  // The middle of the face first, then a step either way: a face refused at
  // its centre usually has room a couple of cells along, and a mound with two
  // mouths where three were asked for is the entry failing its own note.
  const at = [mid, mid - 2, mid + 2, mid - 4, mid + 4].find(clear);
  if (at === undefined) return false;

  for (let k = at - 2; k <= at + 2; k++) {
    const cell = ring(k);
    const jamb = k === at - 2 || k === at + 2;
    if (jamb) {
      for (let y = 1; y <= 2; y++) c.raw(cell.x, y, cell.z, RIB, UPRIGHT);
    } else {
      // The opening itself, both courses, both sides of the wall.
      for (let y = 1; y <= 2; y++) {
        c.raw(cell.x, y, cell.z, "air");
        c.raw(cell.x + out[0], y, cell.z + out[1], "air");
      }
      // A step to walk in on, and the ground under it.
      const ax = cell.x + out[0];
      const az = cell.z + out[1];
      if (ctx.blockAt(ax, 0, az) === undefined) {
        c.raw(ax, 0, az, ctx.style["foundation.primary"] as string);
      }
    }
    // The head: a lintel course across the whole mouth, which is what stops
    // the shell above it looking cut with a knife.
    c.raw(cell.x, lintel, cell.z, CHITIN);
  }
  return true;
}

/** The mound's shape, kept so the vent crown can ask where its own top is. */
interface MoundShape {
  /** The apex's Y. */
  readonly crest: number;
  /** The highest Y of the mound in a column, or `null` when it is not on it. */
  readonly topAt: (x: number, z: number) => number | null;
}

/**
 * The mound itself — a solid half-ellipsoid on the lid.
 *
 * Height comes from the **footprint**, not from the allowance: a mound is
 * defined by being low for its width, and a mound that grew to fill whatever
 * headroom the envelope had would be a dome. Solid per course and shrinking,
 * so every course rests on the one below it and the floating rule is met by
 * construction rather than by check.
 */
function growMound(c: PropCounter, plan: XenoPlan): MoundShape {
  const hx = (plan.sx - 1) >> 1;
  const hz = (plan.sz - 1) >> 1;
  const room = plan.top - plan.base;
  const h = Math.max(1, Math.min(room - 1, Math.max(2, Math.min(hx, hz))));
  /** The ellipsoid, in ten-thousandths. No sine anywhere near it. */
  const inside = (x: number, z: number, k: number): boolean => {
    const dx = x - hx;
    const dz = z - hz;
    return (
      (dx * dx * 10000) / Math.max(1, hx * hx) +
        (dz * dz * 10000) / Math.max(1, hz * hz) +
        (k * k * 10000) / (h * h) <=
      10000
    );
  };
  for (let k = 1; k <= h; k++) {
    const y = plan.base + k;
    for (let z = 0; z < plan.sz; z++) {
      for (let x = 0; x < plan.sx; x++) {
        if (!inside(x, z, k)) continue;
        shellAt(c, x, y, z);
      }
    }
  }
  return {
    crest: plan.base + h,
    topAt: (x, z) => {
      for (let k = h; k >= 1; k--) if (inside(x, z, k)) return plan.base + k;
      return null;
    },
  };
}

/**
 * The vent crown — three short stacks breathing out of the mound's back.
 *
 * Each one stands on the **mound's own surface in its own column**, which is
 * the whole reason {@link MoundShape} exists: a dome's apex is one cell wide,
 * so three vents laid at the crest height would have left two of them in mid
 * air. Each closes on a lit head. Three, because two reads as a mistake and
 * four reads as a machine.
 */
function ventCrown(ctx: FitOutContext, c: PropCounter, plan: XenoPlan, mound: MoundShape): void {
  const mx = (plan.sx - 1) >> 1;
  const mz = (plan.sz - 1) >> 1;
  const spread = Math.max(1, Math.min(mx, mz) >> 1);
  const spots: readonly (readonly [number, number])[] = [
    [mx, mz],
    [mx - spread, mz + 1],
    [mx + spread, mz - 1],
  ];
  for (const [x, z] of spots) {
    if (x < 1 || x > plan.sx - 2 || z < 1 || z > plan.sz - 2) continue;
    const surface = mound.topAt(x, z);
    if (surface === null) continue;
    const stem = Math.min(surface + 1, plan.top);
    if (stem !== surface + 1) continue;
    c.raw(x, stem, z, RIB, UPRIGHT);
    if (stem + 1 <= plan.top) lit(ctx, c, x, stem + 1, z);
  }
}

/* -------------------------------------------------------------------------- */
/* what a hideout eats                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `hydroponics_bay` — racked trays under grow-lamp glow, and a tank at one end.
 *
 * The one building in this half that humans built, and the only one whose icon
 * is **inside**: what a walker sees from the street is a glasshouse full of
 * light, and what they see through the door is rows. So the roof is left
 * exactly as the shell built it — a bay is a shed, and a rebuilt roof here
 * would spend the whole budget on the least interesting surface — and every
 * op goes into four moves:
 *
 * - **the racks**: rows of trays down both flanks, composters (which are
 *   literally boxes of growth) alternating with moss, leaving a clear aisle
 *   down the middle;
 * - **the lamps**: a lit block two courses *above* each second tray. Not one
 *   above — the physics lint calls a column that is solid from floor to
 *   ceiling `interior.blocked_column`, and a tray with a lamp sitting on it is
 *   exactly that. Hung with a gap, it reads as a lamp and leaves the column
 *   open, which is what {@link PropCounter}'s headroom guard enforces;
 * - **the pipe run at the plate**: a copper band along both flanks just under
 *   the eave, hugging the wall so every block of it is supported sideways;
 * - **the tank**: a sunken water plant at the far end, rimmed on every side in
 *   the floor plane — the botanical garden's containment argument exactly, and
 *   the reason it is at `y = 0` rather than standing on the floor.
 */
function fitHydroponicsBay(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  const stone = ctx.style["foundation.accent"] as string;

  // --- the floor: a service aisle down the middle --------------------------
  floorPaint(ctx, c, (x, _z) => (Math.abs(x - lamp.x) <= 1 ? stone : null));

  // --- the tank, or nothing ------------------------------------------------
  // Inset two on every side so the walk round it is two cells wide and every
  // water cell is rimmed by construction; kept to the far end's half of the
  // room and clear of the lantern column and the aisle.
  const tz0 = end.look === "north" ? it.z0 + 1 : Math.max(it.z0 + 1, lamp.z + 2);
  const tz1 = end.look === "north" ? Math.min(it.z1 - 1, lamp.z - 2) : it.z1 - 1;
  const tx0 = Math.max(it.x0 + 2, lamp.x + 2);
  const tx1 = it.x1 - 2;
  const holds = tz1 >= tz0 && tx1 >= tx0;
  if (holds) {
    for (let z = tz0; z <= tz1; z++) {
      for (let x = tx0; x <= tx1; x++) c.raw(x, 0, z, "water", { level: "0" });
    }
    for (let z = tz0 - 1; z <= tz1 + 1; z++) {
      for (let x = tx0 - 1; x <= tx1 + 1; x++) {
        if (x >= tx0 && x <= tx1 && z >= tz0 && z <= tz1) continue;
        if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
        c.raw(x, 0, z, stone);
      }
    }
  }
  const wet = (x: number, z: number): boolean =>
    holds && x >= tx0 - 1 && x <= tx1 + 1 && z >= tz0 - 1 && z <= tz1 + 1;

  // --- the racks ------------------------------------------------------------
  const columns = [it.x0, it.x1];
  if (it.x1 - it.x0 >= 6) columns.push(it.x0 + 1, it.x1 - 1);
  for (const x of columns) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (wet(x, z)) continue;
      const tray = organicJitter(x, 2, z, 3) === 0 ? "moss_block" : "composter";
      const props = tray === "composter" ? { level: "0" } : undefined;
      c.put1(x, z, tray, props);
    }
  }

  // --- the grow lamps -------------------------------------------------------
  // **Glowstone bracketed off the wall, never a lantern hung in mid air.** The
  // first version of this used `sea_lantern` two courses over each tray, and
  // the theme sweep's physics lint duly found it: `unsupported.lantern` fires
  // on ANY block whose name ends in `lantern`, sea lanterns included, and it
  // wants a solid block under a non-hanging one. A lamp resting on its tray is
  // the `interior.blocked_column` rule instead, so there is no third position
  // over a rack that both rules allow.
  //
  // The answer is to light the rack from the **wall** rather than from over
  // it: glowstone (a name no support rule claims) in the wall-hugging rack
  // columns, at the head height a lamp reads at, and only where the wall
  // behind it is a real block — a lamp bracketed to a window opening would be
  // `floating.isolated`. Skipped entirely on a storey too short to hold one
  // clear of its tray, which is what a two-storey bay is.
  const lampY = 3;
  if (ctx.storyHeight - 1 > lampY) {
    for (const [x, wx] of [
      [it.x0, it.x0 - 1],
      [it.x1, it.x1 + 1],
    ] as const) {
      for (let z = it.z0; z <= it.z1; z++) {
        if (!ctx.free(x, z)) continue;
        if (organicJitter(x, lampY, z, 2) !== 0) continue;
        const behind = ctx.blockAt(wx, lampY, z);
        if (behind === undefined || behind.block === "air") continue;
        c.stack(x, z, lampY, "glowstone");
      }
    }
  }

  // --- the pipe run at the plate -------------------------------------------
  // Under **this storey's** ceiling, not under the eave: on a two-storey bay
  // those are different planes, and a run at the eave is a run through the
  // room above — which the theme sweep found as `traversal.unreachable`, the
  // upper floor walled off from its own stair by a pipe.
  //
  // And never in a column the ground floor's own guard has spoken for: the
  // stair flight climbs one of these two, and a pipe laid across its head is
  // the same defect by another route.
  const pipeY = Math.min(ctx.storyHeight - 1, ctx.wallTop - 1);
  if (pipeY > lampY) {
    for (const [x, wx] of [
      [it.x0, it.x0 - 1],
      [it.x1, it.x1 + 1],
    ] as const) {
      for (let z = it.z0; z <= it.z1; z++) {
        if (!ctx.free(x, z)) continue;
        // Only where the run is empty, and only where the wall behind it is a
        // real block: a pipe hung off a window opening is the floating rule.
        if (ctx.blockAt(x, pipeY, z) !== undefined) continue;
        const behind = ctx.blockAt(wx, pipeY, z);
        if (behind === undefined || behind.block === "air") continue;
        c.raw(x, pipeY, z, organicJitter(x, pipeY, z, 5) === 0 ? "waxed_copper_block" : stone);
      }
    }
  }
}
