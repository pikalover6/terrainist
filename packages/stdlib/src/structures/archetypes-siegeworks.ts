/**
 * Archetype breadth, **the siegeworks pack** — seven fortworks and the camp
 * that besieges them.
 *
 * `archetypes-garrison.ts` is this file's nearest neighbour and its model: it
 * owns the buildings a place is *defended from*, and this file owns the
 * **works** — the ground shaped for a fight. A star fort, a motte and bailey,
 * a palisade, a moat, a drawbridge, a drill yard and a siege camp.
 *
 * ## Why these are fit-outs and not a new grammar
 *
 * Read `archetypes-blitz.ts` for the normative statement and
 * `archetypes-garrison.ts` for the military restatement of it. The short form
 * is unchanged: a fit-out runs **after** every shape stage, writes into the
 * same cell map, and may re-clad a wall, work the apron and rebuild a roof —
 * so a palisade is the shell's wall ring turned into a stockade and a siege
 * camp is the shell's roof turned into a tent. Neither is a second grammar,
 * and every invariant the shell guarantees still holds.
 *
 * The catalog files all seven under `kind: "building"`, and that is the honest
 * reading: each of them is an *enclosure* here, not a route. A curtain wall is
 * linear infrastructure and lives in the linework engine; a palisade around a
 * compound is an envelope with a stockade for a wall, which is a fit-out.
 *
 * ## The icon law
 *
 * These entries exist so a world can SCREAM its prompt. A siege camp that does
 * not read as tents-and-earthworks at fifty blocks is a failure however
 * correct its cell map is, so two things are deliberate throughout:
 *
 * - **the silhouette is written first** — the tent ridge, the stockade's
 *   pointed tips, the star's bastion points, the motte's battered skirt — and
 *   the interior fit-out is what is left over;
 * - **the works face away from the door**, because a camp, a bank and an
 *   engine all have a front, and a defence with no direction reads as decor.
 *
 * ## The rules this file obeys, restated because each cost somebody a walk
 *
 * - **nothing leaves the envelope**: bounded above by `roofTop +`
 *   {@link ROOF_FLOURISH_RISE}, and in plan by the footprint plus the one
 *   block of apron the eave already uses;
 * - **the interior stays walkable**, through {@link PropCounter};
 * - **nothing over the doorstep** — the physics lint walks a building from its
 *   door, so a moat, a bank or a stake row written there is a building with no
 *   way in;
 * - **an apron prop stands on the actual ground**: on a platform the apron
 *   sits one below local y0, and a post starting on air fails the support
 *   chain, so every apron column fills y0 first;
 * - **no `chain` blocks and no signs** — the 1.21.11 table carries neither, so
 *   the ops are silently dropped;
 * - a **stair's `facing` is its high half**, the backrest: a seat faces away
 *   from what its sitter looks at;
 * - **decor beside a platform is a WALL banner** — a standing banner on a
 *   floor cell beside something unmountable is a sealed pocket.
 */

import { cardinalStep, type Cardinal, type LocalRect } from "./core.js";
import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
  roofPlan,
  wallPlan,
  type RebuildPlan,
} from "./archetypes-civic.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The seven works this file fits out, roughly by scale.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`.
 */
export const SIEGEWORKS_BUILDING_ARCHETYPES = [
  "star_fort",
  "motte_and_bailey",
  "palisade",
  "moat",
  "drawbridge",
  "drill_yard",
  "siege_camp",
] as const;

/** One of the archetypes this file fits out. */
export type SiegeworksBuildingArchetype = (typeof SIEGEWORKS_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isSiegeworksArchetype(value: string): value is SiegeworksBuildingArchetype {
  return (SIEGEWORKS_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted straight after the garrison table, and for the same reason every
 * later wave sits high in the chain: the tables below it are greedy.
 *
 * The vocabulary is thin on purpose, and the near misses are worth naming
 * because this pack sits in the most crowded corner of the whole tag space:
 *
 * - **`fortress` and `stronghold` are the garrison castle's** and stay there.
 *   The star fort answers to `star_fort`, `starfort`, `bastion_trace` and
 *   `trace_italienne` — never to bare `fort`, which no table claims and which
 *   an author is better served by spelling out;
 * - **`bastion` is the garrison bastion's**, so the star fort may not have it
 *   even though a star fort is made of bastions;
 * - **`castle`, `citadel`, `keep` and `donjon` are the breadth keep's**, so
 *   the motte and bailey answers to `motte`, `bailey` and `motte_and_bailey`;
 * - **`wall` and `curtain_wall` belong to the linework engine**, which builds
 *   a wall along a route. The palisade here is an enclosure, and it answers to
 *   `palisade`, `stockade` and `timber_wall`;
 * - **`bridge` is the linework engine's** too. The drawbridge answers to
 *   `drawbridge` and `bascule` only;
 * - **`camp` and `encampment` are the siege camp's**, which is the one greedy
 *   claim here and a deliberate one: a document that says "camp" in a war
 *   world means this, and no earlier table wanted the word.
 */
export function siegeworksArchetypeOfTags(
  tags: readonly string[],
): SiegeworksBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("star_fort") || has("starfort") || has("bastion_trace") || has("trace_italienne")) {
    return "star_fort";
  }
  if (has("motte_and_bailey") || has("motte") || has("bailey")) return "motte_and_bailey";
  if (has("palisade") || has("stockade") || has("timber_wall")) return "palisade";
  if (has("moat") || has("ditch") || has("water_defence")) return "moat";
  if (has("drawbridge") || has("bascule")) return "drawbridge";
  if (has("drill_yard") || has("parade_ground") || has("drill_ground")) return "drill_yard";
  if (has("siege_camp") || has("camp") || has("encampment") || has("siege")) return "siege_camp";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one. Works are blinder
 * than buildings — a wall somebody stands behind has as few holes as the job
 * allows — and the four that rebuild their top ask for the roof shape with the
 * most vertical room to work in, because a replacement is bounded by where the
 * original finished.
 */
export function siegeworksFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    // Earth and masonry, and a top the parapet takes over.
    case "star_fort":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "motte_and_bailey":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "palisade":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "moat":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "drawbridge":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // A yard is roofed only at its edges; regular lights, and a shed roof.
    case "drill_yard":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // Canvas: the tent is built over a cleared plate, so the shape asked for
    // is the one that leaves the most room under the budget.
    case "siege_camp":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the exterior plan                                                           */
/* -------------------------------------------------------------------------- */

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

/**
 * True when a cell is the doorstep, the door column, or a neighbour of the
 * doorstep on the same face.
 *
 * Wider than the garrison's rule by one cell either side, because the works
 * here write *ground* rather than props: a moat that laps the cell beside the
 * doorstep is a causeway one block wide with water on both shoulders, and a
 * stake row there is a fence across the way in.
 */
function onWayIn(ctx: FitOutContext, x: number, z: number): boolean {
  if (ctx.door === null) return false;
  if (x === ctx.door.x && z === ctx.door.z) return true;
  const out = outsideDoor(ctx);
  if (out === null) return false;
  const [dx, dz] = cardinalStep(ctx.door.face);
  // Along the face, not through it: the causeway is three cells wide.
  if (dz === 0) return x === out.x && Math.abs(z - out.z) <= 1;
  return z === out.z && Math.abs(x - out.x) <= 1;
}

/**
 * Stand a column in the apron, from the **actual** ground.
 *
 * On conformed terrain the apron ground fills local y0; on a platform it sits
 * one lower, and a column that starts at y1 is a column standing on air, which
 * the lint's support-chain rule rightly refuses. Filling y0 first closes the
 * gap.
 */
function apronPost(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  z: number,
  block: string,
  toY: number,
  props?: Record<string, string>,
): void {
  if (ctx.blockAt(x, 0, z) === undefined) c.raw(x, 0, z, block, props);
  for (let y = 1; y <= toY; y++) c.raw(x, y, z, block, props);
}

/**
 * Blocks a re-clad may never overwrite.
 *
 * The garrison's list unchanged: the way in, the way up, the fire, the glass
 * and anything the physics lint holds to a support rule.
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
  plan: RebuildPlan,
  yFrom: number,
  yTo: number,
  block: (x: number, y: number, z: number) => string,
  props?: (x: number, y: number, z: number) => Record<string, string> | undefined,
): number {
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    for (let y = yFrom; y <= yTo; y++) {
      const standing = ctx.blockAt(cell.x, y, cell.z);
      if (standing !== undefined && PRESERVE.test(standing.block)) continue;
      ctx.put(cell.x, y, cell.z, block(cell.x, y, cell.z), props?.(cell.x, y, cell.z));
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

/** The timber mix, for the works that are built out of trees rather than stone. */
function timber(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["wall.frame"] as string;
  const accent = ctx.style["wall.accent"] as string;
  return (x, y, z) => ((x * 5 + y * 11 + z * 3) % 5 === 0 ? accent : primary);
}

/**
 * Clear everything the shell built above the eave plate, apron included.
 *
 * Two courses past `top` as well, because the chimney's corbel and its
 * chimney-pot campfire stand there: a replacement top that cleared only to its
 * own ceiling would leave a fire burning over the ridge it deleted.
 */
function clearRoof(ctx: FitOutContext, plan: RebuildPlan): void {
  for (let y = plan.base; y <= plan.top + 2; y++) {
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) ctx.put(x, y, z, "air");
    }
  }
}

/** Fill an inclusive rect at one Y. */
function fill(
  ctx: FitOutContext,
  y: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  block: string,
  props?: Record<string, string>,
): void {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) ctx.put(x, y, z, block, props);
  }
}

/**
 * A parapet course with merlons on it, restated off the watchtower's rule.
 *
 * The phase is a pure function of position, so opposite walls agree without a
 * draw. Returns the Y of the highest course written, or `null` when there was
 * no room for even the parapet.
 */
function crenellate(
  ctx: FitOutContext,
  plan: RebuildPlan,
  deckY: number,
  block: (x: number, y: number, z: number) => string,
): number | null {
  const parapetY = deckY + 1;
  const merlonY = deckY + 2;
  if (parapetY > plan.top) return null;
  const ring = ringOf(plan.sx, plan.sz);
  for (const cell of ring) ctx.put(cell.x, parapetY, cell.z, block(cell.x, parapetY, cell.z));
  if (merlonY > plan.top) return parapetY;
  for (const cell of ring) {
    if ((cell.x + cell.z) % 2 !== 0) continue;
    ctx.put(cell.x, merlonY, cell.z, block(cell.x, merlonY, cell.z));
  }
  return merlonY;
}

/**
 * A solid fighting deck over the ceiling plane, with a crenellated parapet.
 *
 * The deck is a **solid cap** — the roof-rebuild rule: partial blocks only
 * where something supports them. Returns the deck's Y.
 */
function battlement(ctx: FitOutContext, plan: RebuildPlan): number {
  const stone = masonry(ctx);
  clearRoof(ctx, plan);
  fill(ctx, plan.base, 0, plan.sx - 1, 0, plan.sz - 1, ctx.style["foundation.accent"] as string);
  crenellate(ctx, plan, plan.base, stone);
  return plan.base;
}

/* -------------------------------------------------------------------------- */
/* interior primitives                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One table cell, by the idiom the storey has headroom for.
 *
 * The garrison's rule verbatim: the trestle — a fence stem under a pressure
 * plate — is two blocks in one column and is refused by the stack guard under
 * a three-course storey, so a top slab stands in for it there.
 */
function table(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  if (ctx.storyHeight < 4) {
    return c.put1(x, z, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" });
  }
  if (!c.put1(x, z, ctx.style["wall.fence"] as string)) return false;
  c.stack(x, z, 2, "oak_pressure_plate", { powered: "false" });
  return true;
}

/** Trapdoor props for a panel, screen, rack or shutter hung flat on a wall. */
function shutter(facing: Cardinal): Record<string, string> {
  return { facing, half: "top", open: "false", powered: "false", waterlogged: "false" };
}

/**
 * A rack up a wall row: a fence stem with a trapdoor board over it.
 *
 * On the wall row and two courses at most, so it never body-blocks the
 * circulation and never seals a column — the trapdoor half goes through
 * {@link PropCounter.stack}, which refuses a write that would fill the storey.
 */
function rack(ctx: FitOutContext, c: PropCounter, x: number, z: number, facing: Cardinal): boolean {
  if (!c.put1(x, z, ctx.style["wall.fence"] as string)) return false;
  c.stack(x, z, 2, ctx.style["wall.trapdoor"] as string, shutter(facing));
  return true;
}

/** Which way a rack on this wall row turns its board. */
function rackFacing(it: LocalRect, x: number): Cardinal {
  return x === it.x0 ? "east" : "west";
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

/** The end of the room furthest from the door, and the way a person looks at it. */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/** Lay one bed wherever the room will take it, head against a wall. */
function bedAlcove(ctx: FitOutContext, block: string): boolean {
  const it = ctx.interior;
  const ranges: readonly { readonly x: number; readonly wall: number; readonly facing: Cardinal }[] =
    [
      { x: it.x0 + 1, wall: it.x0, facing: "west" },
      { x: it.x1 - 1, wall: it.x1, facing: "east" },
    ];
  for (const range of ranges) {
    if (range.x < it.x0 || range.x > it.x1 || range.x === range.wall) continue;
    for (let z = it.z0; z <= it.z1; z++) {
      if (!ctx.free(range.x, z) || !ctx.free(range.wall, z)) continue;
      ctx.placeBed(range.x, z, range.facing, block);
      return true;
    }
  }
  return false;
}

/**
 * The apron row furthest from the door: where a work with a *front* puts it.
 *
 * A bank, a stake row and an engine all face somewhere, and the only direction
 * the shell hands a fit-out is its door. Returns the apron z (or x) line on the
 * far side, and whether the far side is a z line at all.
 */
function farApron(ctx: FitOutContext, plan: RebuildPlan): {
  readonly axis: "z" | "x";
  readonly line: number;
} {
  if (ctx.door === null) return { axis: "z", line: -1 };
  const [dx] = cardinalStep(ctx.door.face);
  if (dx !== 0) return { axis: "x", line: ctx.door.x > (plan.sx - 1) / 2 ? -1 : plan.sx };
  return { axis: "z", line: ctx.door.z > (plan.sz - 1) / 2 ? -1 : plan.sz };
}

/** Every apron cell on the far line, doorstep cells excluded by construction. */
function farApronCells(
  plan: RebuildPlan,
  far: { readonly axis: "z" | "x"; readonly line: number },
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  if (far.axis === "z") {
    for (let x = -1; x <= plan.sx; x++) out.push({ x, z: far.line });
  } else {
    for (let z = -1; z <= plan.sz; z++) out.push({ x: far.line, z });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this file's archetypes.
 *
 * Returns the number of blocks written, which `furnish` adds to its own count,
 * so `meta.furnitureCount` keeps meaning "things this building has in it".
 * Zero, and not one cell touched, for anything that is not ours.
 */
export function furnishSiegeworks(ctx: FitOutContext): number {
  if (!isSiegeworksArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "star_fort":
      fitStarFort(ctx, c);
      break;
    case "motte_and_bailey":
      fitMotteAndBailey(ctx, c);
      break;
    case "palisade":
      fitPalisade(ctx, c);
      break;
    case "moat":
      fitMoat(ctx, c);
      break;
    case "drawbridge":
      fitDrawbridge(ctx, c);
      break;
    case "drill_yard":
      fitDrillYard(ctx, c);
      break;
    case "siege_camp":
    default:
      fitSiegeCamp(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the great works                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `star_fort` — the bastion trace, read from above and from the ground.
 *
 * The headline entry, and the one whose silhouette is the whole point. Three
 * moves, in order:
 *
 * 1. a **battered masonry re-clad** — the plinth course is the accent stone
 *    and the wall above it the mix, which is what gives a rampart the heavy
 *    foot a plain wall does not have;
 * 2. the **star trace in the apron**: the apron ring is laid as a masonry
 *    glacis, and then eight **points** — the four corners and the middle of
 *    each face — are raised in a taper, corners highest. Seen from above that
 *    is the pointed outline the name promises; seen from the ground it is a
 *    stepped angular work rising to a parapet;
 * 3. a **gun deck** on top, crenellated, with the powder store below.
 *
 * The doorstep and its two shoulders are left flat, because the way in is the
 * one thing a fort may not fortify shut.
 */
function fitStarFort(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  if (plan !== null) {
    const stone = masonry(ctx);
    const accent = ctx.style["foundation.accent"] as string;
    // The batter: a heavy plinth, then the mix.
    c.n += reclad(ctx, plan, 1, ctx.wallTop, (x, y, z) => (y <= 2 ? accent : stone(x, y, z)));
    battlement(ctx, plan);
    c.n += 1;

    // The trace. A point's height is a function of how far along the face it
    // is — a pure function of position, so opposite faces agree without a draw.
    const primary = ctx.style["foundation.primary"] as string;
    const mid = { x: Math.floor((plan.sx - 1) / 2), z: Math.floor((plan.sz - 1) / 2) };
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const corner =
        (cell.x === -1 || cell.x === plan.sx) && (cell.z === -1 || cell.z === plan.sz);
      const salient =
        (cell.x === mid.x && (cell.z === -1 || cell.z === plan.sz)) ||
        (cell.z === mid.z && (cell.x === -1 || cell.x === plan.sx));
      const flank =
        (Math.abs(cell.x - mid.x) === 1 && (cell.z === -1 || cell.z === plan.sz)) ||
        (Math.abs(cell.z - mid.z) === 1 && (cell.x === -1 || cell.x === plan.sx));
      const height = corner ? 4 : salient ? 3 : flank ? 2 : 1;
      apronPost(ctx, c, cell.x, cell.z, height >= 3 ? accent : primary, Math.min(height, ctx.wallTop));
    }
  }

  // Inside: the powder store on the wall rows, and the plan table.
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 0) continue;
    c.put1(it.x0, z, "barrel", { facing: "up", open: "false" });
    c.put1(it.x1, z, "barrel", { facing: "up", open: "false" });
  }
  table(ctx, c, lamp.x, end.z);
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "cartography_table");
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "chest", { facing: look, type: "single" });
  const bannerY = Math.min(2, ctx.storyHeight - 1);
  const bz = end.look === "north" ? it.z0 + 1 : it.z1 - 1;
  if (bz >= it.z0 && bz <= it.z1) {
    c.raw(it.x0, bannerY, bz, "red_wall_banner", { facing: "east" });
    c.raw(it.x1, bannerY, bz, "red_wall_banner", { facing: "west" });
  }
}

/**
 * `motte_and_bailey` — a timber tower on a raised mound, inside its bailey.
 *
 * The oldest castle there is, and it reads by its **profile**: the apron
 * becomes a battered earth **motte** skirt — coarse dirt stepping up to the
 * wall foot with a grass crown — the shell is re-clad in **timber** rather
 * than stone, and the top is a plank fighting deck behind a **palisade of
 * fence** instead of merlons, because the whole point of the type is that it
 * is thrown up out of earth and trees in a season.
 *
 * Inside, a lord's corner nobody would call comfortable: a bed, a board, a
 * chest and a hearth.
 */
function fitMotteAndBailey(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  if (plan !== null) {
    const wood = timber(ctx);
    c.n += reclad(ctx, plan, 1, ctx.wallTop, wood);
    clearRoof(ctx, plan);
    fill(ctx, plan.base, 0, plan.sx - 1, 0, plan.sz - 1, ctx.style["roof.solid"] as string);
    c.n += 1;
    // The stockade round the deck: fence, not merlons.
    const stake = ctx.style["wall.fence"] as string;
    if (plan.base + 1 <= plan.top) {
      for (const cell of ringOf(plan.sx, plan.sz)) ctx.put(cell.x, plan.base + 1, cell.z, stake);
      c.n += 1;
    }
    // The motte: a coarse-dirt skirt with a grass crown, stepped so the mound
    // reads as a mound rather than as a plinth.
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const corner =
        (cell.x === -1 || cell.x === plan.sx) && (cell.z === -1 || cell.z === plan.sz);
      const height = Math.min(corner ? 3 : 2, Math.max(1, ctx.wallTop - 1));
      apronPost(ctx, c, cell.x, cell.z, "coarse_dirt", height - 1);
      c.raw(cell.x, height, cell.z, "grass_block", { snowy: "false" });
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);
  bedAlcove(ctx, "red_bed");
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    rack(ctx, c, it.x1, z, rackFacing(it, it.x1));
  }
  c.put1(lamp.x, end.z, "campfire", {
    facing: look,
    lit: "false",
    signal_fire: "false",
    waterlogged: "false",
  });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "chest", { facing: look, type: "single" });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "barrel", { facing: "up", open: "false" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  table(ctx, c, it.x0 + 1, nearZ);
}

/**
 * `palisade` — a stockade of sharpened logs, with a walkway behind it.
 *
 * The catalog files this as a building because a palisade *here* is an
 * enclosure: a compound whose wall is trees. So the wall ring becomes a
 * **log stockade** — the wall.frame timber, whole-block, all the way up — and
 * above the plate every column carries a **pointed tip**: an upside-down
 * stair pair reads as a sharpened stake at render scale, and it is bounded by
 * the same one-course allowance every flourish gets.
 *
 * Behind the wall, a **fighting walkway** of slabs on the wall rows, so the
 * defenders have somewhere to be. Inside, nothing but what a stockade holds:
 * a fire, stores, and a spear rack.
 */
function fitPalisade(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    const wood = timber(ctx);
    c.n += reclad(ctx, plan, 1, ctx.wallTop, wood);
    // The tips, one course over the plate and on every other column, so the
    // top reads as a saw rather than as a lid.
    const tipY = ctx.wallTop + 1;
    if (tipY <= plan.top) {
      for (const cell of ringOf(plan.sx, plan.sz)) {
        if ((cell.x + cell.z) % 2 !== 0) continue;
        const standing = ctx.blockAt(cell.x, tipY, cell.z);
        if (standing !== undefined && PRESERVE.test(standing.block)) continue;
        ctx.put(cell.x, tipY, cell.z, ctx.style["wall.fence"] as string);
        c.n++;
      }
    }
    // The outer stake row: short, and never across the way in.
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      if ((cell.x + cell.z) % 2 !== 0) continue;
      apronPost(ctx, c, cell.x, cell.z, ctx.style["wall.frame"] as string, 1);
    }
  }

  const it = ctx.interior;
  const slab = ctx.style["stone.slab"] as string;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);
  // The walkway: slabs down both wall rows, in bays, so a defender can stand
  // up to the wall without the row becoming a solid bench.
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 3 === 2) continue;
    c.put1(it.x0, z, slab, { type: "bottom", waterlogged: "false" });
    c.put1(it.x1, z, slab, { type: "bottom", waterlogged: "false" });
  }
  c.put1(lamp.x, end.z, "campfire", {
    facing: look,
    lit: "false",
    signal_fire: "false",
    waterlogged: "false",
  });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "barrel", { facing: "up", open: "false" });
  if (lamp.x - 1 >= it.x0) rack(ctx, c, lamp.x - 1, end.z, look);
}

/**
 * `moat` — the work is the water, so the water is what gets built.
 *
 * The apron ring is laid as **water** at the ground course, with a masonry
 * **counterscarp** kerb turned up on its outer corners so the ring reads as a
 * cut ditch rather than as a puddle; the shell gets a battered stone plinth,
 * which is what a wall standing in water always has; and the doorstep and its
 * two shoulders are laid as a dry stone **causeway**, because the lint walks a
 * building from its door and a moat across the way in is a building nobody can
 * enter.
 *
 * Inside: the works a moat implies rather than a room — a sluice of cauldrons,
 * a keeper's bench, and stores.
 */
function fitMoat(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    const accent = ctx.style["foundation.accent"] as string;
    const stone = masonry(ctx);
    c.n += reclad(ctx, plan, 1, 2, (x, y, z) => (y === 1 ? accent : stone(x, y, z)));
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) {
        // The causeway: dry, solid, and level with the ground — a **ground**
        // course only. A block at y1 here is a block on the doorstep, which is
        // a moat that has walled its own gate.
        c.raw(cell.x, 0, cell.z, accent);
        continue;
      }
      if (ctx.blockAt(cell.x, 0, cell.z) === undefined) c.raw(cell.x, 0, cell.z, accent);
      c.raw(cell.x, 1, cell.z, "water", { level: "0" });
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 0) continue;
    c.put1(it.x0, z, "cauldron", { level: "3" });
  }
  c.put1(lamp.x, end.z, "cauldron", { level: "3" });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "barrel", { facing: "up", open: "false" });
  if (lamp.x - 1 >= it.x0) {
    c.put1(lamp.x - 1, end.z, ctx.style["stair.interior"] as string, {
      facing: opposite(look),
      half: "bottom",
      shape: "straight",
    });
  }
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x1, nearZ, "chest", { facing: look, type: "single" });
}

/**
 * `drawbridge` — the moat, plus the span and the winch that lifts it.
 *
 * Everything the moat has, and then the three things that make a drawbridge
 * out of one:
 *
 * - a **deck** over the causeway: planks laid on the dry cells in front of the
 *   door, so the way in reads as a bridge rather than as a path;
 * - the **gate frame**: two timber posts either side of the door face, rising
 *   over the door head — the winch's cheeks;
 * - the **raised leaf**: a panel of trapdoors hung on the wall above the door,
 *   which is the bascule stood upright and is the whole silhouette of the
 *   thing.
 *
 * The doorstep column itself is never written above the ground course.
 */
function fitDrawbridge(ctx: FitOutContext, c: PropCounter): void {
  fitMoat(ctx, c);
  const plan = wallPlan(ctx);
  if (plan === null || ctx.door === null) return;
  const out = outsideDoor(ctx);
  if (out === null) return;
  const [, dz] = cardinalStep(ctx.door.face);
  const frame = ctx.style["wall.frame"] as string;
  // The plank deck over the causeway — the **ground** course, so the span is
  // something a player walks on rather than something they walk into.
  const along: readonly (readonly [number, number])[] =
    dz === 0
      ? [
          [out.x, out.z - 1],
          [out.x, out.z],
          [out.x, out.z + 1],
        ]
      : [
          [out.x - 1, out.z],
          [out.x, out.z],
          [out.x + 1, out.z],
        ];
  for (const [x, z] of along) c.raw(x, 0, z, ctx.style["roof.solid"] as string);
  // The winch cheeks, either side of the door on the wall face itself.
  const cheeks: readonly (readonly [number, number])[] =
    dz === 0
      ? [
          [ctx.door.x, ctx.door.z - 1],
          [ctx.door.x, ctx.door.z + 1],
        ]
      : [
          [ctx.door.x - 1, ctx.door.z],
          [ctx.door.x + 1, ctx.door.z],
        ];
  const head = Math.min(ctx.wallTop, 4);
  for (const [x, z] of cheeks) {
    for (let y = 1; y <= head; y++) {
      const standing = ctx.blockAt(x, y, z);
      if (standing !== undefined && PRESERVE.test(standing.block)) continue;
      c.raw(x, y, z, frame);
    }
  }
  // The raised leaf: the bascule stood upright over the doorstep, hung as a
  // panel of trapdoors from the third course up — clear of a player's head, so
  // the way in stays the way in.
  const leafY = Math.min(ctx.wallTop, 5);
  const leafFacing = opposite(ctx.door.face);
  for (let y = 3; y <= leafY; y++) {
    for (const [x, z] of along) {
      c.raw(x, y, z, ctx.style["wall.trapdoor"] as string, shutter(leafFacing));
    }
  }
}

/**
 * `drill_yard` — a parade ground with the wall rows kitted for it.
 *
 * The floor is what a drill yard *is*: a **packed parade surface** written
 * over the interior floor plane in a two-tone grid, so the ground itself reads
 * as marked-out rather than as a room. Round it: **pell posts** — a fence stem
 * with a hay head, the post a recruit beats — down one wall row, **weapon
 * racks** down the other, a **sergeant's dais** of slabs at the far end with
 * banners over it, and **butts** of hay bales in the apron behind the yard.
 *
 * The middle of the floor stays clear, because a parade ground with furniture
 * in the middle is a room.
 */
function fitDrillYard(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  // The marked ground. A floor write is at y0, under the walk, so it costs the
  // walkability nothing and is not a prop.
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      const marked = (x + z) % 4 === 0 || (x - z) % 4 === 0;
      ctx.put(x, 0, z, marked ? "gravel" : "coarse_dirt");
    }
  }
  // One count for the surface, not one per cell: `meta.furnitureCount` means
  // "things this building has in it", and a floor is not a thing in a room.
  c.n += 1;
  // The pells, up the west row; the racks, up the east.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 0) continue;
    if (c.put1(it.x0, z, ctx.style["wall.fence"] as string)) c.stack(it.x0, z, 2, "hay_block");
    rack(ctx, c, it.x1, z, rackFacing(it, it.x1));
  }
  // The dais at the head of the yard, and the colours over it.
  const lamp = lanternColumn(it);
  const slab = ctx.style["stone.slab"] as string;
  for (let x = lamp.x - 1; x <= lamp.x + 1; x++) {
    if (x < it.x0 || x > it.x1) continue;
    c.put1(x, end.z, slab, { type: "bottom", waterlogged: "false" });
  }
  const bannerY = Math.min(2, ctx.storyHeight - 1);
  const bz = end.look === "north" ? it.z0 : it.z1;
  c.raw(it.x0, bannerY, bz, "red_wall_banner", { facing: "east" });
  c.raw(it.x1, bannerY, bz, "red_wall_banner", { facing: "west" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "chest", { facing: look, type: "single" });

  // The butts, in the apron behind the yard.
  const plan = wallPlan(ctx);
  if (plan === null) return;
  const far = farApron(ctx, plan);
  for (const cell of farApronCells(plan, far)) {
    if (onWayIn(ctx, cell.x, cell.z)) continue;
    if ((cell.x + cell.z) % 3 !== 0) continue;
    apronPost(ctx, c, cell.x, cell.z, "hay_block", 1, { axis: "y" });
  }
}

/**
 * `siege_camp` — the headline entry: tents, earthworks, and an engine.
 *
 * A camp is not a building and the fit-out says so at every course:
 *
 * - **the roof becomes a tent.** The shell's roof is cleared and rebuilt as a
 *   ridge of **wool** over a stripped-log ridge pole — canvas, gable, and
 *   nothing that looks like tile;
 * - **the wall becomes canvas on a frame**: wool between timber posts every
 *   third column, so the sides read as a marquee rather than as masonry;
 * - **the earthworks face away from the door**: the far apron line is banked
 *   in coarse dirt with a **stake row** on it, which is the direction the camp
 *   is looking;
 * - **the engine stands on the bank**: a trebuchet read in three columns —
 *   two timber legs, a throwing arm of stairs rising off them, and a stone
 *   counterweight hung at the short end. It is the thing that says *siege*
 *   rather than *tents*;
 * - inside, the camp's business: a map table, a campfire, hay bedrolls, and
 *   stores.
 */
function fitSiegeCamp(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  if (plan !== null) {
    const post = ctx.style["wall.frame"] as string;
    // Canvas on a frame.
    c.n += reclad(ctx, plan, 1, ctx.wallTop, (x, _y, z) =>
      (x + z) % 3 === 0 ? post : "white_wool",
    );
    // The tent: a wool ridge over the plate, tapering to a log ridge pole.
    clearRoof(ctx, plan);
    const mid = (plan.sx - 1) / 2;
    const rise = Math.min(plan.top - plan.base, Math.floor(plan.sx / 2));
    for (let step = 0; step <= rise; step++) {
      const y = plan.base + step;
      const inset = Math.min(step, Math.floor(mid));
      const block = step === rise ? post : "white_wool";
      fill(ctx, y, inset, plan.sx - 1 - inset, 0, plan.sz - 1, block);
    }
    c.n += 1;

    // The earthworks and the engine, on the far side.
    const far = farApron(ctx, plan);
    const bank = farApronCells(plan, far);
    for (const cell of bank) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      apronPost(ctx, c, cell.x, cell.z, "coarse_dirt", 1);
      if ((cell.x + cell.z) % 2 === 0) c.raw(cell.x, 2, cell.z, ctx.style["wall.fence"] as string);
    }
    // The engine: three columns at the middle of the bank.
    const centre = bank[Math.floor(bank.length / 2)];
    if (centre !== undefined && !onWayIn(ctx, centre.x, centre.z)) {
      const armTop = Math.min(ctx.wallTop, 5);
      apronPost(ctx, c, centre.x, centre.z, post, armTop);
      const step = far.axis === "z" ? { x: 1, z: 0 } : { x: 0, z: 1 };
      const legA = { x: centre.x - step.x, z: centre.z - step.z };
      const legB = { x: centre.x + step.x, z: centre.z + step.z };
      for (const leg of [legA, legB]) {
        if (onWayIn(ctx, leg.x, leg.z)) continue;
        apronPost(ctx, c, leg.x, leg.z, post, Math.max(1, armTop - 2));
      }
      // The counterweight, hung at the short end of the arm.
      if (!onWayIn(ctx, legA.x, legA.z)) {
        c.raw(legA.x, Math.max(1, armTop - 1), legA.z, ctx.style["foundation.accent"] as string);
      }
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const lamp = lanternColumn(it);
  // Bedrolls: hay on the wall rows, never in the middle.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    c.put1(it.x0, z, "hay_block", { axis: "z" });
  }
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(it.x1, z, "barrel", { facing: "up", open: "false" });
  }
  // The commander's end: the map table, the fire, and the colours.
  table(ctx, c, lamp.x, end.z);
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "cartography_table");
  if (lamp.x - 1 >= it.x0) {
    c.put1(lamp.x - 1, end.z, "campfire", {
      facing: look,
      lit: "false",
      signal_fire: "false",
      waterlogged: "false",
    });
  }
  const bannerY = Math.min(2, ctx.storyHeight - 1);
  const bz = end.look === "north" ? it.z0 + 1 : it.z1 - 1;
  if (bz >= it.z0 && bz <= it.z1) {
    c.raw(it.x0, bannerY, bz, "red_wall_banner", { facing: "east" });
    c.raw(it.x1, bannerY, bz, "red_wall_banner", { facing: "west" });
  }
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x1, nearZ, "chest", { facing: look, type: "single" });
}
