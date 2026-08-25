/**
 * The **sanctum pack** — ten buildings the icon law asks for by name.
 *
 * `archetypes-blitz.ts` states the design law in full and this file obeys it
 * without restating it: an archetype is a **fit-out**, not a second grammar.
 * Everything here runs after the shape stages and writes into the same cell
 * map, so a classical temple is the shell wearing a peristyle, an obelisk is
 * the tall shell re-clad and brought to a point, and an amphitheatre is the
 * ziggurat's tier stack hollowed into a bowl. Not one line of `core.ts` moves
 * for any of them.
 *
 * Ten buildings in two groups:
 *
 * - **religious and monumental** — `temple`, `chapel`, `shrine`,
 *   `altar_stone`, `wayside_cross`, `obelisk`, `colossus`;
 * - **the classical games** — `amphitheater`, `arena`, `stadium`.
 *
 * ## Why these are shaped by their outsides
 *
 * Every earlier wave is judged by the room it furnishes. This one is judged
 * from **thirty blocks away**: a prompt that says Troy, Rhodes or Olympia is
 * asking for a silhouette, and an interior nobody walks into cannot answer it.
 * So each fit-out here spends its budget on the two surfaces a walker actually
 * sees — the wall ring and the volume between the eave plate and
 * `roofTop + `{@link ROOF_FLOURISH_RISE} — and furnishes the room second.
 * `temple` and `amphitheater` are the headline pair and take the most care: a
 * colonnade under a pediment, and a semicircular tiered bowl.
 *
 * ## The rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} and in plan by the footprint plus
 *    the one-block apron the eave already uses.
 * 2. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take` — the door approach, the stair columns, the hearth reserve and
 *    the connectivity guard, none of them restated here.
 *
 * ## The field lessons this pack was written against
 *
 * Each of these cost a walkthrough in an earlier wave, so each is a rule here:
 *
 * - **a stair's `facing` is its high half** — the backrest. Every seat in
 *   every bank below therefore faces *away* from what its sitter looks at,
 *   which for a bowl means **away from the middle**;
 * - **a stepped shell hangs its steps on nothing.** A roof rebuilt as a ring
 *   per course leaves each course's outermost cells with air below and air
 *   beside them, which is the floating rule exactly. Every rebuilt mass here
 *   is therefore *solid* per course, or a column that reaches the deck;
 * - **a rebuilt roof starts with a lid.** `clearRoof` takes the shell's roof
 *   away; the first thing back is a solid deck over the whole footprint, both
 *   because the room below needs a ceiling and because everything above needs
 *   a floor to stand on;
 * - **an apron post stands on the actual ground.** {@link footing} fills
 *   `y = 0` when the ground there is air, or the colonnade stands on nothing;
 * - a bare `flower_pot` renders **empty**: every pot comes from
 *   {@link pottedAt}, imported from wave two rather than re-declared;
 * - the shell hangs a **lantern** over the middle column of the room at head
 *   height, so nothing here stands in that column and no route runs through
 *   it;
 * - **no sign blocks** anywhere, and no lit fire on an altar: the candles and
 *   the campfires in this file are all unlit;
 * - **no transcendental maths.** The bowls are ellipses drawn from *squared*
 *   radii in integer thousandths — no `Math.sin`, no `Math.pow`, nothing whose
 *   last bit varies by engine.
 */

import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
} from "./archetypes-civic.js";
import { pottedAt } from "./archetypes-wave2.js";
import { cardinalStep, type Cardinal, type LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The ten archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`: the seven religious
 * and monumental ones first, then the three classical games buildings.
 */
export const SANCTUM_BUILDING_ARCHETYPES = [
  "temple",
  "chapel",
  "shrine",
  "altar_stone",
  "wayside_cross",
  "obelisk",
  "colossus",
  "amphitheater",
  "arena",
  "stadium",
] as const;

/** One of the archetypes this file fits out. */
export type SanctumBuildingArchetype = (typeof SANCTUM_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isSanctumArchetype(value: string): value is SanctumBuildingArchetype {
  return (SANCTUM_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after wave 4B's faith table and well before the
 * extended one. The near misses are the whole reason this doc comment exists,
 * and this pack's are the sharpest in the catalog — it owns the **ids**
 * `temple`, `chapel` and `shrine`, and owns **none of those three words**:
 *
 * - bare `temple`, `chapel`, `shrine` and `worship` are the **extended
 *   church's**, every one of them, and have been since G4. A document that
 *   says `temple` is asking for the building the church grammar ships, so the
 *   classical temple here answers to `classical_temple`, `greek_temple`,
 *   `roman_temple`, `peristyle` and `parthenon` instead; the chapel to
 *   `wayside_chapel`, `oratory` and `chantry`; the shrine to
 *   `roadside_shrine`, `votive_shrine` and `votive`. The id is ours, the
 *   vocabulary is not;
 * - `cross` on its own is left unclaimed — it is a shape, not a building — so
 *   the wayside cross takes `wayside_cross`, `market_cross`, `stone_cross`
 *   and `calvary`;
 * - `statue` stays the memorial track's (the statue plinth prop and the war
 *   memorial), so the colossus answers to `colossus`, `colossal_statue` and
 *   `great_statue` only;
 * - `obelisk` is claimed here, and the relics' `shattered_obelisk` keeps its
 *   own compound: a ruin is asked for by the ruin's name;
 * - `circus` is the **big top's** (wave 6D) and `pavilion` the leisure
 *   wave's, so the stadium takes `stadium`, `sports_ground`, `sports_field`
 *   and `hippodrome`, and the arena `arena`, `colosseum` and `gladiator`.
 */
export function sanctumArchetypeOfTags(
  tags: readonly string[],
): SanctumBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (
    has("classical_temple") ||
    has("greek_temple") ||
    has("roman_temple") ||
    has("peristyle") ||
    has("parthenon")
  ) {
    return "temple";
  }
  if (has("wayside_chapel") || has("oratory") || has("chantry")) return "chapel";
  if (has("roadside_shrine") || has("votive_shrine") || has("votive")) return "shrine";
  if (has("altar_stone") || has("altar") || has("sacrificial_altar")) return "altar_stone";
  if (has("wayside_cross") || has("market_cross") || has("stone_cross") || has("calvary")) {
    return "wayside_cross";
  }
  if (has("obelisk") || has("stele") || has("needle")) return "obelisk";
  if (has("colossus") || has("colossal_statue") || has("great_statue")) return "colossus";
  if (has("amphitheater") || has("amphitheatre") || has("odeon")) return "amphitheater";
  if (has("arena") || has("colosseum") || has("gladiator")) return "arena";
  if (has("stadium") || has("sports_ground") || has("sports_field") || has("hippodrome")) {
    return "stadium";
  }
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one. Two families:
 *
 * - the **windowless monuments** — a cella, a cist, a shaft and a plinth are
 *   all blind walls, so they ask for `windowRhythm: "none"` and get the
 *   unbroken ashlar the re-clad wants;
 * - **everything that rebuilds its roof** asks for `hip`, which is the shape
 *   that leaves the most room between the eave plate and the allowance — the
 *   bowl, the pyramidion and the figure are all built in exactly that gap.
 *   The temple and the chapel are the exceptions: both keep a **gable**,
 *   because a pediment and a bellcote are gable-end moves.
 */
export function sanctumFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    // A cella is a blind room behind a colonnade: the light is the door.
    case "temple":
      return { windowShape: "tall", windowRhythm: "none", roof: "gable" };
    case "chapel":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "gable" };
    case "shrine":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "altar_stone":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "wayside_cross":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "obelisk":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "colossus":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // The games: an arcaded podium under an open bank of seats.
    case "amphitheater":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    case "arena":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    case "stadium":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the exterior plan                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What an exterior rebuild needs to know, or `null` when it may not run.
 *
 * Wave 4B's `FaithPlan` in every respect, restated here rather than imported
 * because the two waves are separate seams and a shared private helper is a
 * shared edit. The refusals are the same: a **plain rect** only, and at least
 * two courses of room above the eave plate before a roof may be rebuilt.
 */
interface SanctumPlan {
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
function wallPlan(ctx: FitOutContext): SanctumPlan | null {
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
function roofPlan(ctx: FitOutContext): SanctumPlan | null {
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
function clearRoof(ctx: FitOutContext, plan: SanctumPlan): void {
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
 * Wave 4B's list unchanged: the way in, the way up, the fire, the glass and
 * anything the physics lint holds to a support rule.
 */
const PRESERVE = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

/**
 * Re-clad the wall ring between two courses.
 *
 * `block` is a pure function of position, so opposite walls agree and the
 * result is deterministic without a draw.
 */
function reclad(
  ctx: FitOutContext,
  plan: SanctumPlan,
  yFrom: number,
  yTo: number,
  block: (x: number, y: number, z: number) => string,
): number {
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    for (let y = yFrom; y <= yTo; y++) {
      const standing = ctx.blockAt(cell.x, y, cell.z);
      if (standing !== undefined && PRESERVE.test(standing.block)) continue;
      ctx.put(cell.x, y, cell.z, block(cell.x, y, cell.z));
      n++;
    }
  }
  return n;
}

/** The masonry mix the re-clads draw from — the shell's own stone palette. */
function masonry(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (x, y, z) => ((x * 7 + y * 13 + z * 5) % 6 === 0 ? accent : primary);
}

/**
 * **Ashlar** — the same palette laid in courses rather than in a scatter.
 *
 * A monument is dressed stone, and dressed stone bands by course. Banding on
 * `y` alone is what makes a shaft read as a shaft rather than as rubble.
 */
function ashlar(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (_x, y, _z) => (y % 4 === 0 ? accent : primary);
}

/** Fill an inclusive rect at one Y, counting every cell. */
function deck(
  c: PropCounter,
  y: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  block: (x: number, z: number) => string,
): void {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) c.raw(x, y, z, block(x, z));
  }
}

/**
 * Fill the ground course under an apron cell when the ground there is air.
 *
 * Wave 4B's cathedral lesson, as a named function: the apron is not always at
 * `y = 1`, and a column whose foot is air is a column standing on nothing.
 */
function footing(ctx: FitOutContext, c: PropCounter, x: number, z: number, block: string): void {
  if (ctx.blockAt(x, 0, z) === undefined) c.raw(x, 0, z, block);
}

/** The middle column of the room — where the shell hangs its lantern. */
function lanternColumn(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
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
 * The end of the room furthest from the door, and the way a person looks at it.
 *
 * Every altar, niche and cult figure in this file stands at `z`, so a
 * worshipper faces it on the way in.
 */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/**
 * A seat that looks in direction `look`.
 *
 * THE STAIR-SEAT RULE, in one function so no fit-out here can get it wrong: a
 * stair's `facing` names the side its **high half** stands on — the backrest —
 * so a seat faces *away* from whatever its sitter is looking at.
 */
function seat(look: Cardinal): Record<string, string> {
  return { facing: opposite(look), half: "bottom", shape: "straight" };
}

/** Unlit candles, the only light this file ever puts on an altar. */
const CANDLES = (n: number): Record<string, string> => ({
  candles: String(n),
  lit: "false",
  waterlogged: "false",
});

/** The cardinal that points from the middle of a bowl out to `(dx, dz)`. */
function outward(dx: number, dz: number): Cardinal {
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? "east" : "west";
  return dz >= 0 ? "south" : "north";
}

/* -------------------------------------------------------------------------- */
/* the bowl                                                                    */
/* -------------------------------------------------------------------------- */

/** Squared radius, in thousandths of the ellipse's own, at which the floor ends. */
const BOWL_FLOOR_Q = 260;

/**
 * The tier a bowl cell stands on — 0 on the flat middle, rising outward.
 *
 * An **ellipse without a square root**: the cell's offset is divided by the
 * bowl's own half-extents and summed as squares in thousandths, so `q <= 1000`
 * is inside the ellipse and the corners of the square footprint fall outside
 * it and take the outermost tier. Integer-and-division arithmetic only —
 * §6.5 rule 6 forbids a transcendental anywhere in this package, and a bowl
 * drawn with a cosine would be a world that differs by engine.
 */
function bowlTier(dx: number, dz: number, rx: number, rz: number, tiers: number): number {
  if (rx <= 0 || rz <= 0 || tiers <= 0) return 0;
  const q = (dx * dx * 1000) / (rx * rx) + (dz * dz * 1000) / (rz * rz);
  if (q <= BOWL_FLOOR_Q) return 0;
  if (q >= 1000) return tiers;
  const band = (1000 - BOWL_FLOOR_Q) / tiers;
  return Math.min(tiers, Math.floor((q - BOWL_FLOOR_Q) / band) + 1);
}

/** How many courses of seating there is room for over the eave plate. */
function bowlTiers(plan: SanctumPlan): number {
  return Math.max(1, Math.min(4, plan.top - plan.base - 1));
}

/**
 * Build a tiered bowl on the deck of a rebuilt roof.
 *
 * The one geometry the three games buildings share, and the reason they are in
 * this file together. Every seating cell is a **solid column from the deck**,
 * capped by a stair whose backrest faces outward — so a sitter looks in at the
 * middle, every block has the block below it for support, and the mass of the
 * bank is what carries the silhouette. `keep` decides which cells are bank at
 * all: the amphitheatre passes a half-plane and gets a semicircle, the arena
 * passes everything and gets a ring.
 */
function bowl(
  ctx: FitOutContext,
  c: PropCounter,
  plan: SanctumPlan,
  keep: (x: number, z: number) => boolean,
): { readonly cx: number; readonly cz: number; readonly rx: number; readonly rz: number } {
  const cx = (plan.sx - 1) / 2;
  const cz = (plan.sz - 1) / 2;
  const rx = (plan.sx - 1) / 2;
  const rz = (plan.sz - 1) / 2;
  const tiers = bowlTiers(plan);
  const stone = ashlar(ctx);
  const stairs = ctx.style["stone.stairs"] as string;
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) {
      if (!keep(x, z)) continue;
      const t = bowlTier(x - cx, z - cz, rx, rz, tiers);
      if (t <= 0) continue;
      const capY = Math.min(plan.top, plan.base + t);
      for (let y = plan.base + 1; y < capY; y++) c.raw(x, y, z, stone(x, y, z));
      // The seat itself: a stair whose *backrest* is the outward face, so the
      // sitter on it looks in at the floor of the bowl.
      c.raw(x, capY, z, stairs, {
        facing: outward(x - cx, z - cz),
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      });
    }
  }
  return { cx, cz, rx, rz };
}

/**
 * The podium every games building stands on: re-clad walls and a cornice.
 *
 * A Roman theatre is a substructure with the seating on top of it, which is
 * exactly what the building grammar hands this file — so the wall ring is
 * dressed as the arcaded base it is, and a slab cornice in the apron draws the
 * shadow line the bank sits behind.
 */
function podium(ctx: FitOutContext, c: PropCounter, plan: SanctumPlan): void {
  c.n += reclad(ctx, plan, 1, ctx.wallTop, masonry(ctx));
  const slabBlock = ctx.style["stone.slab"] as string;
  for (const cell of apronOf(plan.sx, plan.sz)) {
    if (onWayIn(ctx, cell.x, cell.z)) continue;
    c.raw(cell.x, ctx.wallTop, cell.z, slabBlock, { type: "bottom", waterlogged: "false" });
  }
}

/** The solid lid a rebuilt roof always starts with — a ceiling, and a floor. */
function lid(ctx: FitOutContext, c: PropCounter, plan: SanctumPlan): void {
  const stone = ashlar(ctx);
  deck(c, plan.base, 0, plan.sx - 1, 0, plan.sz - 1, (x, z) => stone(x, plan.base, z));
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
export function furnishSanctum(ctx: FitOutContext): number {
  if (!isSanctumArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "temple":
      fitTemple(ctx, c);
      break;
    case "chapel":
      fitChapel(ctx, c);
      break;
    case "shrine":
      fitShrine(ctx, c);
      break;
    case "altar_stone":
      fitAltarStone(ctx, c);
      break;
    case "wayside_cross":
      fitWaysideCross(ctx, c);
      break;
    case "obelisk":
      fitObelisk(ctx, c);
      break;
    case "colossus":
      fitColossus(ctx, c);
      break;
    case "amphitheater":
      fitAmphitheater(ctx, c);
      break;
    case "arena":
      fitArena(ctx, c);
      break;
    case "stadium":
    default:
      fitStadium(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the temple                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The cult group a temple and a shrine both end on.
 *
 * A dressed plinth at the head of the room with a block-built figure standing
 * on it and unlit candles either side. Written once because two buildings want
 * exactly it, and the figure is a *block* rather than a head or an armour
 * stand: this grammar has no entities and no block entities to spend here.
 */
function cultFigure(ctx: FitOutContext, c: PropCounter, x: number, z: number): void {
  const it = ctx.interior;
  if (c.put1(x, z, "chiseled_stone_bricks")) {
    c.stack(x, z, 2, ctx.style["foundation.accent"] as string);
  }
  if (x - 1 >= it.x0) c.put1(x - 1, z, "white_candle", CANDLES(3));
  if (x + 1 <= it.x1) c.put1(x + 1, z, "white_candle", CANDLES(2));
}

/**
 * `temple` — the headline: a peristyle under a pediment.
 *
 * Four moves, and the first three are the whole silhouette:
 *
 * - **the stylobate**, the step the temple stands on: the apron ring filled at
 *   the ground course, so the colonnade has a platform rather than a hem;
 * - **the peristyle**: a column in every other apron bay, corners always, from
 *   the stylobate to one course under the plate. The doorstep bay is left open
 *   — a porch a walker can get through is worth more than a symmetry nobody
 *   counts;
 * - **the entablature**: an unbroken band of full blocks on the column heads,
 *   right round the ring. The bays between columns hang off their neighbours,
 *   which is what a lintel *is*, and no cell of it has six air faces;
 * - **the pediment**: the roof rebuilt as a mass that insets in **x only**, so
 *   the ridge runs down the length of the building and each short end is the
 *   triangle everyone means by a classical temple. Solid per course, because a
 *   stepped shell hangs its steps on nothing.
 *
 * Inside is a **cella**: a blind room, a processional carpet, an inner
 * colonnade down both flanks and the cult figure at the head of it.
 */
function fitTemple(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    const stone = ashlar(ctx);
    c.n += reclad(ctx, wall, 1, ctx.wallTop, stone);
    const drum = ctx.style["foundation.primary"] as string;
    const colTop = Math.max(1, ctx.wallTop - 1);
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      footing(ctx, c, cell.x, cell.z, drum);
      // Every other bay carries a column, counted along the side it stands on
      // so the two long flanks agree with each other.
      const onX = cell.x === -1 || cell.x === wall.sx;
      const along = (onX ? cell.z : cell.x) + 1;
      if (along % 2 !== 0) continue;
      for (let y = 1; y <= colTop; y++) c.raw(cell.x, y, cell.z, drum);
    }
    // The entablature: continuous, so the bays between columns are lintels.
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      c.raw(cell.x, ctx.wallTop, cell.z, ctx.style["foundation.accent"] as string);
    }
  }

  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    const stone = ashlar(ctx);
    // The pediment mass: inset in x only, solid per course.
    for (let y = roof.base; y <= roof.top; y++) {
      const k = y - roof.base;
      const x0 = k;
      const x1 = roof.sx - 1 - k;
      if (x0 > x1) break;
      deck(c, y, x0, x1, 0, roof.sz - 1, (x, z) => stone(x, y, z));
    }
    // The cornice, in the apron at the eave course: it stands on the
    // entablature the colonnade already carried.
    const slabBlock = ctx.style["stone.slab"] as string;
    for (const cell of apronOf(roof.sx, roof.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      c.raw(cell.x, roof.base, cell.z, slabBlock, { type: "bottom", waterlogged: "false" });
    }
  }

  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  // The processional: one carpet lane down the middle, clear of the lantern
  // column and of the row in front of the figure.
  const stepZ = end.z === it.z0 ? it.z0 + 1 : it.z1 - 1;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === lamp.z || z === stepZ) continue;
    c.put1(mid, z, "orange_carpet");
  }
  // The inner colonnade: two ranks down the flanks, every third bay.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 3) {
    for (const x of [it.x0 + 1, it.x1 - 1]) {
      if (x <= it.x0 || x >= it.x1) continue;
      if (x === lamp.x && z === lamp.z) continue;
      if (c.put1(x, z, ctx.style["foundation.primary"] as string)) {
        c.stack(x, z, 2, ctx.style["foundation.accent"] as string);
      }
    }
  }
  cultFigure(ctx, c, mid, end.z);
}

/* -------------------------------------------------------------------------- */
/* the small sacred                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `chapel` — the church at village scale, and read by its **bellcote**.
 *
 * A chapel is not a small church by furniture — it is a small church by
 * *silhouette*: no tower, no steeple, and one bell hung in a gablet on the
 * end wall over the door. So the fit-out spends almost nothing inside (a short
 * aisle, two bays of pews, an altar) and builds the bellcote properly: two
 * piers standing on the wall plate, a lintel across them, and the bell hung
 * from that lintel with `attachment: ceiling` — a bell attached to nothing is
 * dropped on the first block update.
 */
function fitChapel(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    // A stone base under the plaster: two courses only, so the chapel keeps
    // the modest wall the village gave it.
    c.n += reclad(ctx, wall, 1, Math.min(2, ctx.wallTop), masonry(ctx));
    const slabBlock = ctx.style["stone.slab"] as string;
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const y = ctx.blockAt(cell.x, 0, cell.z) === undefined ? 0 : 1;
      c.raw(cell.x, y, cell.z, slabBlock, { type: "bottom", waterlogged: "false" });
    }
  }

  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const pew = ctx.style["stair.interior"] as string;
  for (let z = it.z0; z <= it.z1; z++) {
    if (z === lamp.z) continue;
    c.put1(mid, z, "red_carpet");
  }
  const first = end.z === it.z0 ? it.z0 + 2 : it.z0;
  const last = end.z === it.z0 ? it.z1 : it.z1 - 2;
  for (let z = first; z <= last; z++) {
    if (z === lamp.z || (z - first) % 3 === 2) continue;
    for (let x = it.x0; x <= it.x1; x++) {
      if (x >= mid - 1 && x <= mid + 1) continue;
      c.put1(x, z, pew, seat(end.look));
    }
  }
  if (c.put1(mid, end.z, "chiseled_stone_bricks")) {
    c.stack(mid, end.z, 2, "white_candle", CANDLES(2));
  }
  if (mid - 1 >= it.x0) {
    c.put1(mid - 1, end.z, "lectern", {
      facing: opposite(end.look),
      has_book: "false",
      powered: "false",
    });
  }
  if (mid + 1 <= it.x1) c.put1(mid + 1, end.z, pottedAt(mid + 1, end.z));

  if (wall !== null) emitBellcote(ctx, c, wall, end.z === it.z0 ? wall.sz - 1 : 0);
}

/**
 * A bellcote on the gable end: two piers, a lintel and a bell under it.
 *
 * The piers rewrite the plate course under themselves before they rise, so
 * each one stands on solid wall whatever the shell put there — the alternative
 * is a pier resting on the one cell of the plate that happened to be a rafter
 * end. Bounded by `roofTop + `{@link ROOF_FLOURISH_RISE} like everything else
 * above the eave.
 */
function emitBellcote(
  ctx: FitOutContext,
  c: PropCounter,
  plan: SanctumPlan,
  gableZ: number,
): void {
  const mx = Math.floor(plan.sx / 2);
  if (mx - 1 < 0 || mx + 1 > plan.sx - 1) return;
  // The lintel goes **one course over the ridge**. A bellcote whose head is
  // level with the eave is a bell in an attic: it has to break the roofline or
  // it is not a silhouette at all.
  const head = plan.top;
  if (head - ctx.wallTop < 3) return;
  const stone = ashlar(ctx);
  for (const px of [mx - 1, mx + 1]) {
    c.raw(px, ctx.wallTop, gableZ, stone(px, ctx.wallTop, gableZ));
    for (let y = ctx.wallTop + 1; y < head; y++) c.raw(px, y, gableZ, stone(px, y, gableZ));
  }
  // The opening between the piers: whatever roof the shell laid through it is
  // taken away, so the bell hangs in air and can be seen from the road.
  for (let y = ctx.wallTop + 1; y < head - 1; y++) ctx.put(mx, y, gableZ, "air");
  for (let x = mx - 1; x <= mx + 1; x++) c.raw(x, head, gableZ, stone(x, head, gableZ));
  c.raw(mx, head - 1, gableZ, "bell", {
    attachment: "ceiling",
    facing: "north",
    powered: "false",
  });
}

/**
 * `shrine` — a niche under a stepped canopy.
 *
 * The smallest sacred thing that is still a building. Outside: the walls
 * re-clad in masonry and the roof rebuilt as a **stepped canopy** — one inset
 * per course, closing on a solid cap with a lantern standing on it, so the
 * whole thing reads as a lit marker from the road. Inside: nothing but the
 * niche — the cult figure at the head of the room, a carpet approach and a
 * pot.
 */
function fitShrine(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, masonry(ctx));

  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    const stone = ashlar(ctx);
    let capY = roof.base;
    let rect: LocalRect = roof.rect;
    for (let y = roof.base; y <= roof.top; y++) {
      const k = y - roof.base;
      const x0 = k;
      const x1 = roof.sx - 1 - k;
      const z0 = k;
      const z1 = roof.sz - 1 - k;
      if (x0 > x1 || z0 > z1) break;
      // Solid per course: a canopy of rings would hang its rings on nothing.
      deck(c, y, x0, x1, z0, z1, (x, z) => stone(x, y, z));
      capY = y;
      rect = { x0, z0, x1, z1 };
    }
    // The light on the cap — standing, not hanging, and on a solid block.
    const fx = (rect.x0 + rect.x1) >> 1;
    const fz = (rect.z0 + rect.z1) >> 1;
    if (capY + 1 <= roof.top) {
      c.raw(fx, capY + 1, fz, "lantern", { hanging: "false", waterlogged: "false" });
    }
  }

  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === lamp.z) continue;
    c.put1(mid, z, "white_carpet");
  }
  cultFigure(ctx, c, mid, end.z);
  if (it.x0 !== mid) c.put1(it.x0, end.z, pottedAt(it.x0, end.z));
}

/**
 * `altar_stone` — a megalith: a capstone on a chamber, ringed by standing
 * stones.
 *
 * The one entry here whose read is *weight*. The roof comes off and goes back
 * as **two solid courses** over the whole footprint with a one-block lip in
 * the apron — a dolmen's capstone, overhanging the chamber it lies on — and
 * four **standing stones** rise in the apron corners past the top of it, which
 * is what turns a stone box into a monument at a hundred paces.
 *
 * Inside is the altar itself: a three-cell table of dressed stone with slab
 * tops, laid off the lantern column so nobody has to stand under the light to
 * stand at it, and unlit candles at both ends.
 */
function fitAltarStone(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, masonry(ctx));
  if (roof !== null) {
    clearRoof(ctx, roof);
    const stone = ashlar(ctx);
    lid(ctx, c, roof);
    // The capstone: a second course over the lid, and the lip that overhangs
    // it — every lip cell has the deck beside it, so none of them floats.
    if (roof.base + 1 <= roof.top) {
      deck(c, roof.base + 1, 0, roof.sx - 1, 0, roof.sz - 1, (x, z) => stone(x, roof.base + 1, z));
    }
    for (const cell of apronOf(roof.sx, roof.sz)) {
      c.raw(cell.x, roof.base, cell.z, stone(cell.x, roof.base, cell.z));
    }
    // The standing stones: apron corners, grounded, and taller than the cap.
    const menhir = ctx.style["foundation.primary"] as string;
    const corners: readonly (readonly [number, number])[] = [
      [-1, -1],
      [-1, roof.sz],
      [roof.sx, -1],
      [roof.sx, roof.sz],
    ];
    for (const [x, z] of corners) {
      if (onWayIn(ctx, x, z)) continue;
      footing(ctx, c, x, z, menhir);
      for (let y = 1; y <= roof.top; y++) c.raw(x, y, z, menhir);
    }
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const slabBlock = ctx.style["stone.slab"] as string;
  // The table, one column off the middle: a bier under the lantern is a bier
  // nobody can stand beside.
  const ax = lamp.x - 1 >= it.x0 ? lamp.x - 1 : lamp.x + 1;
  for (let z = lamp.z - 1; z <= lamp.z + 1; z++) {
    if (z < it.z0 || z > it.z1) continue;
    if (c.put1(ax, z, "chiseled_stone_bricks")) {
      c.stack(ax, z, 2, slabBlock, { type: "bottom", waterlogged: "false" });
    }
  }
  const end = farEnd(ctx);
  c.put1(it.x0, end.z, "white_candle", CANDLES(4));
  c.put1(it.x1, end.z, "white_candle", CANDLES(2));
  c.put1(lamp.x, end.z, "campfire", { lit: "false", signal_fire: "false", facing: "north", waterlogged: "false" });
}

/**
 * `wayside_cross` — a cross on a stepped calvary, and the shell is its plinth.
 *
 * The roof comes off; a lid goes down; two shrinking steps stack on it; and a
 * shaft rises out of the top step with a bar of arms near its head. Every
 * block of it stands on the block below or hangs off the shaft beside it, so
 * the arms are cantilevers rather than floaters.
 *
 * Inside: a kneeler facing the head of the room, candles and a carpet path —
 * a wayside cross has no congregation, and the room is a porch out of the rain.
 */
function fitWaysideCross(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
  if (roof !== null) {
    clearRoof(ctx, roof);
    const stone = ashlar(ctx);
    lid(ctx, c, roof);
    const mx = (roof.sx - 1) >> 1;
    const mz = (roof.sz - 1) >> 1;
    // The calvary: steps, each inset one further than the one under it — but
    // only as many as leave the shaft room to be a shaft. A cross whose arms
    // sit on the top step is a pyramid with a lump on it.
    const room = roof.top - roof.base;
    const steps = room >= 6 ? 2 : room >= 4 ? 1 : 0;
    let y = roof.base + 1;
    for (let k = 1; k <= steps && y <= roof.top; k++, y++) {
      const x0 = Math.min(mx, k);
      const x1 = Math.max(mx, roof.sx - 1 - k);
      const z0 = Math.min(mz, k);
      const z1 = Math.max(mz, roof.sz - 1 - k);
      deck(c, y, x0, x1, z0, z1, (cx, cz) => stone(cx, y, cz));
    }
    // The shaft, and the arms one course under its head.
    const headY = roof.top;
    const armY = Math.max(y, headY - 1);
    for (let sy = y; sy <= headY; sy++) c.raw(mx, sy, mz, stone(mx, sy, mz));
    if (armY < headY) {
      for (const ax of [mx - 1, mx + 1]) {
        if (ax < 0 || ax > roof.sx - 1) continue;
        c.raw(ax, armY, mz, stone(ax, armY, mz));
      }
    }
  }

  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === lamp.z) continue;
    c.put1(mid, z, "gray_carpet");
  }
  const kneelZ = end.z === it.z0 ? it.z0 + 1 : it.z1 - 1;
  if (kneelZ !== lamp.z) {
    c.put1(mid, kneelZ, ctx.style["stair.interior"] as string, seat(end.look));
  }
  c.put1(mid, end.z, "chiseled_stone_bricks");
  if (mid - 1 >= it.x0) c.put1(mid - 1, end.z, "white_candle", CANDLES(2));
  if (mid + 1 <= it.x1) c.put1(mid + 1, end.z, pottedAt(mid + 1, end.z));
}

/* -------------------------------------------------------------------------- */
/* the landmarks                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `obelisk` — the tall shell dressed as one stone and brought to a point.
 *
 * The trick is that the **shell is the shaft**. A slim, tall envelope re-clad
 * in banded ashlar with no openings at all already reads as a monolith; what
 * this fit-out adds is the two things that finish one — an apron plinth at the
 * foot, and a **pyramidion** at the head: the shaft carried two courses past
 * the plate, then a solid pyramid closing on a cap with a spike on it.
 *
 * Inside, almost nothing: a dedication plinth and two unlit candles. An
 * obelisk with furniture is a tower.
 */
function fitObelisk(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    // The plinth: a full apron course at the foot, so the shaft has a base.
    const plinth = ctx.style["foundation.accent"] as string;
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      footing(ctx, c, cell.x, cell.z, plinth);
      c.raw(cell.x, 1, cell.z, plinth);
    }
  }
  if (roof !== null) {
    clearRoof(ctx, roof);
    const stone = ashlar(ctx);
    // Two courses of shaft above the plate, then the pyramidion — unless the
    // allowance is too short for both, in which case the *point* wins. An
    // obelisk that runs out of height finishes flat, which is a chimney.
    const need = (roof.sx >> 1) + 1;
    const shaftTop = Math.max(roof.base, Math.min(roof.base + 1, roof.top - need));
    for (let y = roof.base; y <= shaftTop; y++) {
      deck(c, y, 0, roof.sx - 1, 0, roof.sz - 1, (x, z) => stone(x, y, z));
    }
    let capY = shaftTop;
    let rect: LocalRect = roof.rect;
    for (let y = shaftTop + 1; y <= roof.top; y++) {
      const k = y - shaftTop;
      const x0 = k;
      const x1 = roof.sx - 1 - k;
      const z0 = k;
      const z1 = roof.sz - 1 - k;
      if (x0 > x1 || z0 > z1) break;
      deck(c, y, x0, x1, z0, z1, (x, z) => stone(x, y, z));
      capY = y;
      rect = { x0, z0, x1, z1 };
    }
    const fx = (rect.x0 + rect.x1) >> 1;
    const fz = (rect.z0 + rect.z1) >> 1;
    if (capY + 1 <= roof.top) c.raw(fx, capY + 1, fz, "end_rod", { facing: "up" });
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const mid = Math.floor((it.x0 + it.x1) / 2);
  c.put1(mid, end.z, "chiseled_stone_bricks");
  if (it.x0 !== mid) c.put1(it.x0, end.z, "white_candle", CANDLES(2));
  if (it.x1 !== mid) c.put1(it.x1, end.z, "white_candle", CANDLES(3));
}

/**
 * `colossus` — a figure at landmark scale, standing on the building.
 *
 * The shell is the **pedestal** and everything between the plate and the
 * allowance is the statue: two legs, a torso bridging them, shoulders one cell
 * deep either side, a head, one arm hanging and one arm raised with a torch on
 * it. The proportions are derived from the room there actually is, so a short
 * envelope gives a squat herm rather than a broken figure — and every part of
 * it either stands on the part below or has the torso beside it, which is what
 * keeps a cantilevered arm off the floating rule.
 *
 * Inside the pedestal: a dedication — a plinth, candles and a lectern.
 */
function fitColossus(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    const slabBlock = ctx.style["stone.slab"] as string;
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const y = ctx.blockAt(cell.x, 0, cell.z) === undefined ? 0 : 1;
      c.raw(cell.x, y, cell.z, slabBlock, { type: "bottom", waterlogged: "false" });
    }
  }
  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const body = ctx.style["foundation.accent"] as string;
    const mx = (roof.sx - 1) >> 1;
    const mz = (roof.sz - 1) >> 1;
    // The proportions, from the top down: the raised hand's torch takes the
    // last course, the head the one under it, and what is left is split
    // between torso and legs. Deriving downward is what keeps a short envelope
    // from producing a figure with no head rather than a shorter figure.
    const room = roof.top - roof.base;
    const headY = roof.top - 1;
    const shoulder = headY - 1;
    const hip = roof.base + Math.max(1, Math.floor((shoulder - roof.base) / 2));
    if (room >= 5 && mx - 1 >= 0 && mx + 1 <= roof.sx - 1 && shoulder > hip) {
      // The legs.
      for (const lx of [mx - 1, mx + 1]) {
        for (let y = roof.base + 1; y <= hip; y++) c.raw(lx, y, mz, body);
      }
      // The torso: three wide, bridging the legs — the middle cell of the
      // first course has a leg beside it on each hand, which is support.
      for (let y = hip + 1; y <= shoulder; y++) {
        for (let x = mx - 1; x <= mx + 1; x++) c.raw(x, y, mz, body);
      }
      // The shoulders, one cell deep either way: a figure one block thick is
      // a wall with a head on it.
      for (const dz of [-1, 1]) {
        const sz2 = mz + dz;
        if (sz2 < 0 || sz2 > roof.sz - 1) continue;
        c.raw(mx, shoulder, sz2, body);
      }
      // The arms: one hanging, one raised with a torch standing on it.
      if (mx - 2 >= 0) {
        for (let y = shoulder; y >= Math.max(hip + 1, shoulder - 2); y--) c.raw(mx - 2, y, mz, body);
      }
      if (mx + 2 <= roof.sx - 1) {
        const reach = Math.min(roof.top - 1, shoulder + 1);
        for (let y = shoulder; y <= reach; y++) c.raw(mx + 2, y, mz, body);
        if (reach + 1 <= roof.top) c.raw(mx + 2, reach + 1, mz, "torch");
      }
      // The head.
      c.raw(mx, headY, mz, "chiseled_stone_bricks");
    } else {
      // No room for a figure: a herm — a pillar with a head on it, which is
      // what antiquity itself did when the budget ran out.
      for (let y = roof.base + 1; y < roof.top; y++) c.raw(mx, y, mz, body);
      c.raw(mx, roof.top, mz, "chiseled_stone_bricks");
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const mid = Math.floor((it.x0 + it.x1) / 2);
  c.put1(mid, end.z, "chiseled_stone_bricks");
  if (mid - 1 >= it.x0) {
    c.put1(mid - 1, end.z, "lectern", {
      facing: opposite(end.look),
      has_book: "false",
      powered: "false",
    });
  }
  if (mid + 1 <= it.x1) c.put1(mid + 1, end.z, "white_candle", CANDLES(3));
}

/* -------------------------------------------------------------------------- */
/* the classical games                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Benches down both interior walls, with the middle of the room left open.
 *
 * The undercroft every games building has under its bank: a place to stand out
 * of the sun, and — for the fit-out — a way to furnish a room without ever
 * putting anything in the lane a body walks down.
 */
function undercroft(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const bench = ctx.style["stair.interior"] as string;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    c.put1(it.x0, z, bench, seat("east"));
    c.put1(it.x1, z, bench, seat("west"));
  }
  const end = farEnd(ctx);
  c.put1(it.x0 + 1, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1 - 1, end.z, pottedAt(it.x1 - 1, end.z));
}

/**
 * `amphitheater` — the headline: a semicircular bowl on a Roman podium.
 *
 * The building grammar hands this file a box with a room in it; a Roman
 * theatre *is* a box with rooms in it, carrying the cavea on top. So the walls
 * are dressed as the podium they are, the roof comes off and goes back as a
 * solid deck, and the seating is built on that deck as a **half bowl**:
 *
 * - the tiers are only built on the far half of the deck, so the bank is a
 *   semicircle open toward the door;
 * - every seating cell is a solid column from the deck capped by a stair whose
 *   backrest faces **outward**, so the whole bank looks in at the orchestra;
 * - the flat half carries the **stage** — a slab platform across the open side
 *   with the orchestra circle between it and the seats.
 *
 * The ellipse is drawn from squared radii in thousandths, never from a sine:
 * a bowl that differs in its last bit by engine is a world that is not
 * reproducible.
 */
function fitAmphitheater(ctx: FitOutContext, c: PropCounter): void {
  const roof = roofPlan(ctx);
  if (roof !== null) {
    podium(ctx, c, roof);
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const cz = (roof.sz - 1) / 2;
    // The open side is the door's side: a walker arrives at the stage and
    // looks up into the bank, which is the view the building is for.
    const doorLow = ctx.door === null ? true : ctx.door.z <= cz;
    const keep = (_x: number, z: number): boolean => (doorLow ? z >= cz - 1 : z <= cz + 1);
    bowl(ctx, c, roof, keep);
    // The stage: a slab platform across the open half, one course over the
    // deck it lies on.
    const slabBlock = ctx.style["stone.slab"] as string;
    const stageZ0 = doorLow ? 1 : Math.floor(cz) + 2;
    const stageZ1 = doorLow ? Math.floor(cz) - 1 : roof.sz - 2;
    if (roof.base + 1 <= roof.top && stageZ1 >= stageZ0) {
      for (let z = stageZ0; z <= stageZ1; z++) {
        for (let x = 2; x <= roof.sx - 3; x++) {
          c.raw(x, roof.base + 1, z, slabBlock, { type: "bottom", waterlogged: "false" });
        }
      }
    }
  } else {
    const wall = wallPlan(ctx);
    if (wall !== null) podium(ctx, c, wall);
  }
  undercroft(ctx, c);
}

/**
 * `arena` — the amphitheatre closed into a ring, round a floor of sand.
 *
 * One difference of geometry and three of dressing. The bank is a **full
 * ellipse** rather than a half one, so the silhouette is a ring; the floor of
 * it is sand rather than stone, which is the read that says blood sport rather
 * than chorus; a podium course rings the sand, because a Roman arena wall is
 * what kept the show off the front row; and a ring of fence posts stands on
 * the top tier — the masts a velarium was slung from.
 */
function fitArena(ctx: FitOutContext, c: PropCounter): void {
  const roof = roofPlan(ctx);
  if (roof !== null) {
    podium(ctx, c, roof);
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const shape = bowl(ctx, c, roof, () => true);
    const tiers = bowlTiers(roof);
    const fence = ctx.style["wall.fence"] as string;
    if (roof.base + 1 <= roof.top) {
      for (let z = 0; z < roof.sz; z++) {
        for (let x = 0; x < roof.sx; x++) {
          const t = bowlTier(x - shape.cx, z - shape.cz, shape.rx, shape.rz, tiers);
          if (t !== 0) continue;
          c.raw(x, roof.base + 1, z, "sand");
        }
      }
    }
    // The velarium masts: fence posts on the crown of the bank, at the four
    // compass points, each standing on the tier below it.
    const crown = Math.min(roof.top, roof.base + tiers);
    if (crown + 1 <= roof.top) {
      const mx = (roof.sx - 1) >> 1;
      const mz = (roof.sz - 1) >> 1;
      const posts: readonly (readonly [number, number])[] = [
        [mx, 0],
        [mx, roof.sz - 1],
        [0, mz],
        [roof.sx - 1, mz],
      ];
      // A fence stands on what is under it, and the crown of a bank is a
      // *stair*. Each mast cell therefore gets its seat swapped for a full
      // block first — a post on a half block is a post the support walk fails.
      const stone = ashlar(ctx);
      for (const [x, z] of posts) {
        c.raw(x, crown, z, stone(x, crown, z));
        c.raw(x, crown + 1, z, fence);
      }
    }
  } else {
    const wall = wallPlan(ctx);
    if (wall !== null) podium(ctx, c, wall);
  }
  // The hypogeum: cages down the flanks, and the benches of the undercroft.
  const it = ctx.interior;
  const fence = ctx.style["wall.fence"] as string;
  for (let z = it.z0 + 2; z <= it.z1 - 2; z += 3) {
    c.put1(it.x0 + 1, z, fence);
    c.put1(it.x1 - 1, z, fence);
  }
  undercroft(ctx, c);
}

/**
 * `stadium` — the straight-sided cousin: a pitch, two banks and four masts.
 *
 * No ellipse here, because a stadium is not one: the deck carries a
 * **rectangular pitch** of green with a halfway line and a centre spot, a
 * straight bank of seats down each long side stepping up outward from it, and
 * a **floodlight mast** at each corner of the deck with a lit head. The masts
 * are the silhouette — four lights over a green rectangle reads as a stadium
 * from further away than any amount of seating detail does.
 */
function fitStadium(ctx: FitOutContext, c: PropCounter): void {
  const roof = roofPlan(ctx);
  if (roof !== null) {
    podium(ctx, c, roof);
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const stone = ashlar(ctx);
    const stairs = ctx.style["stone.stairs"] as string;
    const tiers = bowlTiers(roof);
    const mx = (roof.sx - 1) >> 1;
    const mz = (roof.sz - 1) >> 1;
    // The banks: one per long side, stepping up as they leave the pitch.
    // A quarter of the width per side and no more: a pitch narrower than the
    // stands it sits between is a corridor, not a field.
    const bankDepth = Math.min(tiers, Math.max(1, Math.floor((roof.sx - 2) / 4)));
    for (let z = 1; z <= roof.sz - 2; z++) {
      for (let k = 0; k < bankDepth; k++) {
        const t = bankDepth - k;
        for (const x of [1 + k, roof.sx - 2 - k]) {
          if (x < 1 || x > roof.sx - 2) continue;
          const capY = Math.min(roof.top, roof.base + t);
          for (let y = roof.base + 1; y < capY; y++) c.raw(x, y, z, stone(x, y, z));
          c.raw(x, capY, z, stairs, {
            facing: x <= mx ? "west" : "east",
            half: "bottom",
            shape: "straight",
            waterlogged: "false",
          });
        }
      }
    }
    // The pitch, and its markings.
    if (roof.base + 1 <= roof.top) {
      for (let z = 1; z <= roof.sz - 2; z++) {
        for (let x = 1 + bankDepth; x <= roof.sx - 2 - bankDepth; x++) {
          // The markings: a halfway line across the middle and a goal line at
          // each end, in white on the green.
          const line = z === mz || z === 2 || z === roof.sz - 3;
          c.raw(x, roof.base + 1, z, line ? "white_carpet" : "green_carpet");
        }
      }
    }
    // The floodlights: a mast in each corner of the deck, lit at the head.
    const mastTop = Math.min(roof.top, roof.base + tiers + 2);
    const post = ctx.style["stone.wall"] as string;
    const corners: readonly (readonly [number, number])[] = [
      [0, 0],
      [0, roof.sz - 1],
      [roof.sx - 1, 0],
      [roof.sx - 1, roof.sz - 1],
    ];
    for (const [x, z] of corners) {
      for (let y = roof.base + 1; y < mastTop; y++) {
        c.raw(x, y, z, post, { waterlogged: "false" });
      }
      if (mastTop > roof.base + 1) c.raw(x, mastTop, z, "sea_lantern");
    }
  } else {
    const wall = wallPlan(ctx);
    if (wall !== null) podium(ctx, c, wall);
  }
  undercroft(ctx, c);
}
