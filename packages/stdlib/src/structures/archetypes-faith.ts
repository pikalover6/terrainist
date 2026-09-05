/**
 * Archetype breadth, **wave four B** — twelve buildings of faith and memory.
 *
 * `archetypes-blitz.ts` states the design law in full and this file obeys it
 * without restating it: an archetype is a **fit-out**, not a second grammar.
 * Everything here runs after the shape stages and writes into the same cell
 * map, so a cathedral is the church idiom writ large, a ziggurat is the
 * pueblo's terrace stacked, a stupa is the trullo's corbel closed as a dome,
 * and a minaret is the wizard's tower slimmed. Not one line of `core.ts`
 * changes for any of them.
 *
 * ## The two rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} and in plan by the footprint plus
 *    the one-block apron the eave already uses.
 * 2. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take` — the door approach, the stair columns, the hearth reserve and
 *    the connectivity guard, all honoured without this file restating them.
 *
 * ## The field lessons this wave was written against
 *
 * Each of these cost a walkthrough somewhere in an earlier wave, so each is a
 * rule here rather than a comment:
 *
 * - **a stair's `facing` is its high half** — the backrest. A seat therefore
 *   faces *away* from what its sitter looks at. The abbey's two ranks of choir
 *   stalls face each other, which means the west rank carries `facing: "west"`
 *   and the east rank `facing: "east"`;
 * - a bare `flower_pot` renders **empty**: every pot comes from
 *   {@link pottedAt}, imported from wave two rather than re-declared;
 * - the shell hangs a **lantern** over the middle column of the room at head
 *   height. Nothing here stands in that column and no route runs through it:
 *   the cloister's well head is offset from the garth's centre and the
 *   synagogue's bimah sits beside it, not under it;
 * - the trestle table is refused by the stack guard under a three-course
 *   storey, so {@link table} switches to a top slab there;
 * - **circulation is never body-blocked**: the cathedral's centre aisle is
 *   three columns wide, and the stupa's circumambulation lane is the whole
 *   ring between the core and the walls;
 * - **apron props stand on the actual ground**: a buttress or a balcony post
 *   fills `y = 0` first when the ground there is air, or it is a column
 *   standing on nothing;
 * - a **dome, cone or tier closes on a solid cap**; a partial block only ever
 *   stands directly on solid support, which is where the finials go;
 * - **no sign blocks** anywhere. Banners are fine, and the mosque takes
 *   neither: nothing figural.
 */

import { buildingIdFromTags, defineBuildingDescriptors, type BuildingDescriptor } from "./descriptor.js";
import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  emitSteeple,
  type FitOutContext,
  roofPlan,
  wallPlan,
  type RebuildPlan,
} from "./archetypes-civic.js";
import { pottedAt } from "./archetypes-wave2.js";
import { cardinalStep, type Cardinal, type LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The twelve archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`. Eleven are religious;
 * `tomb` is the memorial category's, and a building rather than a prop.
 */
export const FAITH_BUILDING_ARCHETYPES = [
  "cathedral",
  "monastery",
  "abbey",
  "cloister",
  "hermitage",
  "mosque",
  "synagogue",
  "stupa",
  "ziggurat",
  "bell_tower",
  "minaret",
  "tomb",
] as const;

/** One of the archetypes this file fits out. */
export type FaithBuildingArchetype = (typeof FAITH_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isFaithArchetype(value: string): value is FaithBuildingArchetype {
  return (FAITH_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted straight after the institutions and well before the extended
 * table. Not one tag below is one an earlier table claims, and the near misses
 * are the whole reason this doc comment exists — each would have been a silent
 * theft of a building that already works:
 *
 * - `church`, `chapel`, `temple`, `shrine` and `worship` are the **extended
 *   church's**, every one of them. A cathedral answers to `cathedral` only,
 *   because a document tagged `temple` is asking for the building the church
 *   grammar has been shipping since G4;
 * - `tomb` and `sepulchre` are the **mausoleum's**, claimed by the breadth
 *   table. This file's `tomb` archetype is therefore reached by
 *   `burial_chamber` and `cist` instead — the id is ours, the vocabulary is
 *   not;
 * - `tower` is the **watchtower's** and is checked before any of this, so the
 *   bell tower takes `bell_tower`, `campanile` and `belfry`, and the minaret
 *   its own name;
 * - `pagoda` is the breadth table's and `monastery` does not claim `abbey`
 *   (nor the other way round): they are two buildings here, not one.
 */
function faithArchetypeOfTags(tags: readonly string[]): FaithBuildingArchetype | null {
  return buildingIdFromTags(FAITH_BUILDING_DESCRIPTORS, tags);
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one. Everything that
 * rebuilds its roof asks for the shape with the **most vertical room** under
 * the allowance, because the replacement is bounded by where the original one
 * finished.
 */
export function faithFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    // A nave reads by its lights, and a cathedral's are paired and tall.
    case "cathedral":
      return { windowShape: "tall", windowRhythm: "paired", roof: "gable" };
    case "monastery":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    case "abbey":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    // A cloister looks inward: the openings that matter are not on the street.
    case "cloister":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    case "hermitage":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "mosque":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    case "synagogue":
      return { windowShape: "tall", windowRhythm: "regular", roof: "hip" };
    // The dome and the tiers both need the tallest shell to rebuild out of.
    case "stupa":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "ziggurat":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "bell_tower":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
    case "minaret":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // A tomb is a sealed box: no openings at all.
    case "tomb":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the exterior plan                                                           */
/* -------------------------------------------------------------------------- */

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: RebuildPlan): void {
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
 * Wave three's list unchanged: the way in, the way up, the fire, the glass and
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
  plan: RebuildPlan,
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

/** Fill an inclusive rect at one Y. */
function slab(
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

/** True when an inset rect is too small to be drawn as a ring. */
function degenerate(x0: number, x1: number, z0: number, z1: number): boolean {
  return x1 - x0 < 2 || z1 - z0 < 2;
}

/**
 * Corbel a dome or a cone over the envelope, closing on a **solid cap**.
 *
 * Wave three's `corbel`, restated for this seam. `courses` is how many courses
 * are laid before the ring steps in — 1 for a spire, 2 for the swelling dome a
 * stupa wants. The first course is solid (it is the lid of the room below) and
 * the last is capped, so the shape finishes on a face rather than on a hole.
 * A partial block — the finial spike — only ever stands on that solid cap.
 */
function corbel(
  ctx: FitOutContext,
  plan: RebuildPlan,
  block: (x: number, y: number, z: number) => string,
  cap: string,
  courses = 1,
  finial?: string,
): number {
  let n = 0;
  let capY = plan.base;
  let rect: LocalRect = plan.rect;
  for (let y = plan.base; y <= plan.top; y++) {
    const k = Math.floor((y - plan.base) / courses);
    const x0 = k;
    const x1 = plan.sx - 1 - k;
    const z0 = k;
    const z1 = plan.sz - 1 - k;
    if (x0 > x1 || z0 > z1 || (k > 0 && degenerate(x0, x1, z0, z1))) break;
    capY = y;
    rect = { x0, z0, x1, z1 };
    n++;
    if (y === plan.base) {
      slab(ctx, y, x0, x1, z0, z1, block(x0, y, z0));
      continue;
    }
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
        ctx.put(x, y, z, block(x, y, z));
      }
    }
  }
  slab(ctx, capY, rect.x0, rect.x1, rect.z0, rect.z1, cap);
  if (capY + 1 <= plan.top) {
    ctx.put((rect.x0 + rect.x1) >> 1, capY + 1, (rect.z0 + rect.z1) >> 1, finial ?? cap);
    n++;
  }
  return n;
}

/**
 * A **stepped terrace stack** — the ziggurat's roof, and the pueblo's idiom
 * stacked rather than laid once.
 *
 * Each tier is a solid deck inset one further than the tier below it, so every
 * course sits on the one under it and the silhouette is the staircase everyone
 * means by "ziggurat". Two to three tiers, drawn from the room there actually
 * is between the plate and the allowance, and the last one is a solid cap.
 * Returns the top tier's rect and its Y, which is where the shrine goes.
 */
function tiers(
  ctx: FitOutContext,
  plan: RebuildPlan,
  deck: string,
  riser: string,
): { readonly y: number; readonly rect: LocalRect } {
  const room = plan.top - plan.base;
  const count = Math.max(2, Math.min(3, room));
  const step = Math.max(1, Math.floor(room / count));
  let y = plan.base;
  let rect: LocalRect = plan.rect;
  for (let k = 0; k < count; k++) {
    const ty = plan.base + k * step;
    if (ty > plan.top) break;
    const x0 = k;
    const x1 = plan.sx - 1 - k;
    const z0 = k;
    const z1 = plan.sz - 1 - k;
    if (x0 > x1 || z0 > z1 || (k > 0 && degenerate(x0, x1, z0, z1))) break;
    // The deck, solid: a tier is a floor somebody could stand on.
    slab(ctx, ty, x0, x1, z0, z1, deck);
    // The riser: the ring of the tier above, carried up to it.
    for (let ry = ty + 1; ry < Math.min(plan.base + (k + 1) * step, plan.top + 1); ry++) {
      for (const cell of ringOf(plan.sx, plan.sz)) {
        const rx = cell.x;
        const rz = cell.z;
        if (rx < x0 || rx > x1 || rz < z0 || rz > z1) continue;
        ctx.put(rx, ry, rz, riser);
      }
    }
    y = ty;
    rect = { x0, z0, x1, z1 };
  }
  return { y, rect };
}

/* -------------------------------------------------------------------------- */
/* interior primitives                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One table cell, by the idiom the storey has headroom for.
 *
 * The trestle — a fence stem under a pressure plate — is two blocks in one
 * column and is refused by the stack guard under a three-course storey, so a
 * top slab stands in for it there.
 */
function table(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  if (ctx.storyHeight < 4) {
    return c.put1(x, z, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" });
  }
  if (!c.put1(x, z, ctx.style["wall.fence"] as string)) return false;
  c.stack(x, z, 2, "oak_pressure_plate", { powered: "false" });
  return true;
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
 * Every altar, mihrab, ark and shrine in this file stands at `z`, so a
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

/** Trapdoor props for a screen, shutter or balcony rail hung against a wall. */
function shutter(facing: Cardinal): Record<string, string> {
  return { facing, half: "top", open: "false", powered: "false", waterlogged: "false" };
}

/** Unlit candles, the only light this file ever puts on an altar. */
const CANDLES = (n: number): Record<string, string> => ({
  candles: String(n),
  lit: "false",
  waterlogged: "false",
});

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this file's archetypes.
 *
 * Returns the number of blocks written, which `furnish` adds to its own count.
 * Zero, and not one cell touched, for anything that is not ours.
 */
function furnishFaith(ctx: FitOutContext): number {
  if (!isFaithArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "cathedral":
      fitCathedral(ctx, c);
      break;
    case "monastery":
      fitMonastery(ctx, c);
      break;
    case "abbey":
      fitAbbey(ctx, c);
      break;
    case "cloister":
      fitCloister(ctx, c);
      break;
    case "hermitage":
      fitHermitage(ctx, c);
      break;
    case "mosque":
      fitMosque(ctx, c);
      break;
    case "synagogue":
      fitSynagogue(ctx, c);
      break;
    case "stupa":
      fitStupa(ctx, c);
      break;
    case "ziggurat":
      fitZiggurat(ctx, c);
      break;
    case "bell_tower":
      fitBellTower(ctx, c);
      break;
    case "minaret":
      fitMinaret(ctx, c);
      break;
    case "tomb":
    default:
      fitTomb(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the great churches                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The altar group every church-shaped fit-out here ends on.
 *
 * A block of dressed stone with unlit candles on it at the head of the aisle,
 * a lectern turned to the congregation beside it, and a pot on the other side.
 * Written once because three buildings want exactly it.
 */
function altarAt(ctx: FitOutContext, c: PropCounter, x: number, z: number, look: Cardinal): void {
  const it = ctx.interior;
  if (c.put1(x, z, "chiseled_stone_bricks")) c.stack(x, z, 2, "white_candle", CANDLES(2));
  // The lectern is read *from* the altar end, so it faces back down the room.
  if (x - 1 >= it.x0) {
    c.put1(x - 1, z, "lectern", {
      facing: opposite(look),
      has_book: "false",
      powered: "false",
    });
  }
  if (x + 1 <= it.x1) c.put1(x + 1, z, pottedAt(x + 1, z));
}

/**
 * `cathedral` — the church idiom writ large.
 *
 * Four things make it a cathedral rather than a big church, and all four are
 * the church's own moves taken further:
 *
 * - **buttresses** in the apron: masonry piers every third bay, standing on
 *   the *actual* ground (a pier whose foot is air fails the support-chain
 *   rule), rising to the plinth head and finished with an upturned stair that
 *   leans back against the wall;
 * - **paired tall lights**, which the facade defaults ask for;
 * - a **crossing**: a band of carpet across the nave at the altar bay, and the
 *   steeple over it — the same flourish the church takes, which is bounded by
 *   `roofTop + ROOF_FLOURISH_RISE` and so cannot leave the envelope;
 * - **side-aisle pew blocks** either side of a **three-column** centre aisle.
 *   Three, not one: the shell's lantern hangs over the middle column, and an
 *   aisle one cell wide through it is a nave with a wall in the middle.
 */
function fitCathedral(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    const stone = masonry(ctx);
    c.n += reclad(ctx, plan, 1, 2, stone);
    // The buttresses, in the apron, every third bay along each wall.
    const stairs = ctx.style["stone.stairs"] as string;
    const buttressTop = Math.min(3, ctx.wallTop - 1);
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const onX = cell.x === -1 || cell.x === plan.sx;
      const along = onX ? cell.z : cell.x;
      if (along < 1 || along % 3 !== 1) continue;
      // Lesson: the apron is not always at `y = 1`. Fill the ground course
      // when there is nothing there, or the pier stands on air.
      if (ctx.blockAt(cell.x, 0, cell.z) === undefined) {
        ctx.put(cell.x, 0, cell.z, stone(cell.x, 0, cell.z));
        c.n++;
      }
      for (let y = 1; y <= buttressTop; y++) {
        ctx.put(cell.x, y, cell.z, stone(cell.x, y, cell.z));
        c.n++;
      }
      // The weathering: an upturned stair leaning back on the wall.
      const facing: Cardinal =
        cell.x === -1 ? "west" : cell.x === plan.sx ? "east" : cell.z === -1 ? "north" : "south";
      ctx.put(cell.x, buttressTop + 1, cell.z, stairs, {
        facing,
        half: "top",
        shape: "straight",
      });
      c.n++;
    }
  }

  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const end = farEnd(ctx);
  const pew = ctx.style["stair.interior"] as string;

  // The centre aisle: three columns of carpet, which is passable floor.
  //
  // Everything in this nave — carpet and pew alike — stays **off the interior
  // perimeter ring**, so a clear lane runs all the way round the fit-out
  // against the walls. That lane is what keeps the floor one region no matter
  // how the bays fall, and it is the honest read as well: a nave has an aisle
  // round its furniture.
  //
  // The **chancel step** — the row directly in front of the altar — is left as
  // bare floor rather than carpeted. It is the one row where the shell's own
  // reserves bite, and a reserved cell ringed by carpet on three sides is a
  // cell the strict reading of the floor calls stranded.
  //
  // The **lantern bay** is skipped for the same family of reason: the shell's
  // light hangs over the middle column, the counter rightly refuses a carpet
  // under it, and a bare cell ringed by carpet on all four sides is stranded
  // under the strict reading. Leaving its whole row bare turns that hole into
  // a crossing of clear floor.
  const chancelZ = end.z === it.z0 ? it.z0 + 1 : it.z1 - 1;
  const lampZ = lanternColumn(it).z;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === chancelZ || z === lampZ) continue;
    for (const x of [mid - 1, mid, mid + 1]) {
      if (x <= it.x0 || x >= it.x1) continue;
      c.put1(x, z, "red_carpet");
    }
  }
  // The crossing: a band of carpet across the nave, one bay in front of the
  // altar, so the plan reads as a cross rather than as a hall.
  const crossZ = end.z === it.z0 ? it.z0 + 2 : it.z1 - 2;
  if (crossZ > it.z0 && crossZ < it.z1) {
    for (let x = it.x0 + 1; x <= it.x1 - 1; x++) c.put1(x, crossZ, "red_carpet");
  }
  // The side aisles: pews in bays of two, turned to the altar.
  const first = end.z === it.z0 ? it.z0 + 3 : it.z0 + 1;
  const last = end.z === it.z0 ? it.z1 - 1 : it.z1 - 3;
  for (let z = first; z <= last; z++) {
    // The lantern bay stays clear right across the nave, pews included: three
    // bare cells with a block of pews either side of them is a pocket, not a
    // bay. Left open, it is the transept lane that ties the side aisles to the
    // walls.
    if (z === crossZ || z === lampZ) continue;
    if ((z - first) % 3 === 2) continue;
    for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
      if (x >= mid - 1 && x <= mid + 1) continue;
      c.put1(x, z, pew, seat(end.look));
    }
  }
  altarAt(ctx, c, mid, end.z, end.look);
  emitSteeple(ctx, c);
}

/**
 * `monastery` — a working house: refectory, scriptorium, cells.
 *
 * Three uses in one room, laid along the length of it and separated by what a
 * monastery actually separates them with: nothing but furniture. The refectory
 * table runs down the column beside the aisle with benches turned to it, the
 * scriptorium desks stand against the opposite wall, and the cells are fence
 * **partitions** two cells deep off the far wall — deep enough to read as a
 * division, never deep enough to be a wall across the room.
 */
function fitMonastery(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const fence = ctx.style["wall.fence"] as string;
  const lamp = lanternColumn(it);
  const boardX = it.x0 + 1 <= it.x1 - 1 ? it.x0 + 1 : it.x0;

  // The refectory: a long board with benches every other bay on both sides.
  const board: number[] = [];
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (boardX === lamp.x && z === lamp.z) continue;
    if (table(ctx, c, boardX, z)) board.push(z);
  }
  for (let k = 0; k < board.length; k += 2) {
    const z = board[k] as number;
    // A diner looks at the board: west of it looks east, east of it looks west.
    if (boardX - 1 >= it.x0) c.put1(boardX - 1, z, ctx.style["stair.interior"] as string, seat("east"));
    if (boardX + 1 <= it.x1) c.put1(boardX + 1, z, ctx.style["stair.interior"] as string, seat("west"));
  }

  // The scriptorium: desks against the far wall, each with its stool turned
  // away from the desk it is drawn up to.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 3) {
    if (!c.put1(it.x1, z, "lectern", { facing: "west", has_book: "false", powered: "false" })) {
      continue;
    }
    if (it.x1 - 1 > boardX) {
      c.put1(it.x1 - 1, z, ctx.style["stair.interior"] as string, seat("east"));
    }
  }

  // The cells: partitions off the door-end wall, two deep and no more.
  const cellZ = farEnd(ctx).z === it.z0 ? it.z1 : it.z0;
  const inward = cellZ === it.z0 ? 1 : -1;
  for (let x = it.x0 + 2; x <= it.x1 - 2; x += 3) {
    c.put1(x, cellZ, fence);
    c.put1(x, cellZ + inward, fence);
  }
  c.put1(it.x0, cellZ, "bookshelf");
  c.put1(it.x1, cellZ, "barrel", { facing: "up", open: "false" });
}

/**
 * `abbey` — a nave with **choir stalls**: two ranks that face each other.
 *
 * The stalls are the whole read, and they are the sharpest test of the seat
 * rule in this file. Two ranks flank the aisle looking *across* it: the west
 * rank looks east, so its backrest — its `facing` — is **west**; the east rank
 * looks west, so its facing is **east**. Get either one wrong and the abbey
 * seats its choir with their backs to each other.
 *
 * Outside, a cloister-walk trim: a slab cornice in the apron at the plate,
 * which is the shadow line a monastic range is read by.
 */
function fitAbbey(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    const slabBlock = ctx.style["stone.slab"] as string;
    for (const cell of apronOf(plan.sx, plan.sz)) {
      ctx.put(cell.x, ctx.wallTop, cell.z, slabBlock, { type: "top", waterlogged: "false" });
      c.n++;
    }
    c.n += reclad(ctx, plan, 1, 1, masonry(ctx));
  }

  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const end = farEnd(ctx);
  const stall = ctx.style["stair.interior"] as string;

  // The aisle, down the middle, stopping one short of each end wall: the
  // perimeter ring stays clear floor, which is the lane that keeps the two
  // sides of the choir one region.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) c.put1(mid, z, "red_carpet");

  // The choir: two ranks either side of the aisle, one column out from it so
  // the aisle keeps a clear cell of its own on each side.
  const west = mid - 2;
  const east = mid + 2;
  const from = end.z === it.z0 ? it.z0 + 2 : it.z0 + 1;
  const to = end.z === it.z0 ? it.z1 - 1 : it.z1 - 2;
  for (let z = from; z <= to; z++) {
    if (west >= it.x0) c.put1(west, z, stall, seat("east"));
    if (east <= it.x1) c.put1(east, z, stall, seat("west"));
  }
  altarAt(ctx, c, mid, end.z, end.look);
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, "bookshelf");
}

/**
 * `cloister` — the courtyard house, sanctified.
 *
 * The garth is the building: the middle of the floor is **left open**, planted
 * at its corners, with a well head one cell off the centre — off, because the
 * shell hangs its lantern over the exact middle and a well under a lantern is
 * a well nobody can stand at.
 *
 * The walk round it is suggested rather than built: fence posts on the wall
 * rows every other bay, which read as an arcade from inside and take nothing
 * from the circulation ring, because the ring is the cells *between* the posts
 * and the garth.
 */
function fitCloister(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const fence = ctx.style["wall.fence"] as string;

  // The arcade: posts on the wall rows, every other bay, never on a corner.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    c.put1(it.x0, z, fence);
    c.put1(it.x1, z, fence);
  }
  for (let x = it.x0 + 2; x <= it.x1 - 2; x += 2) {
    c.put1(x, it.z0, fence);
    c.put1(x, it.z1, fence);
  }

  // The garth: grass under the open middle, which is floor rather than furniture.
  for (let z = it.z0 + 2; z <= it.z1 - 2; z++) {
    for (let x = it.x0 + 2; x <= it.x1 - 2; x++) ctx.put(x, 0, z, "grass_block");
  }
  c.n++;

  // The well head: a rim of stone one cell off the lantern column, with the
  // water in it. One cell, so it never divides the garth.
  const wellZ = lamp.z + 1 <= it.z1 - 2 ? lamp.z + 1 : lamp.z - 1;
  if (wellZ >= it.z0 && wellZ <= it.z1) c.put1(lamp.x, wellZ, "cauldron", { level: "3" });

  // Planted corners.
  for (const [px, pz] of [
    [it.x0 + 2, it.z0 + 2],
    [it.x1 - 2, it.z0 + 2],
    [it.x0 + 2, it.z1 - 2],
    [it.x1 - 2, it.z1 - 2],
  ] as const) {
    if (px < it.x0 || px > it.x1 || pz < it.z0 || pz > it.z1) continue;
    c.put1(px, pz, pottedAt(px, pz));
  }
  const end = farEnd(ctx);
  c.put1(it.x0, end.z, "lectern", {
    facing: opposite(end.look),
    has_book: "false",
    powered: "false",
  });
}

/**
 * `hermitage` — one austere cell.
 *
 * A cot, a lectern and a shrine niche: three props, and the restraint is the
 * point. The niche is a cell of the far wall re-clad in dressed stone with a
 * candle standing on the sill below it — which is the whole of the ornament a
 * hermit's cell is allowed.
 */
function fitHermitage(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const wallZ = end.z === it.z0 ? it.z0 - 1 : it.z1 + 1;

  // The niche, in the wall plane itself: dressed stone, two courses.
  for (let y = 2; y <= Math.min(3, ctx.wallTop - 1); y++) {
    const standing = ctx.blockAt(mid, y, wallZ);
    if (standing !== undefined && PRESERVE.test(standing.block)) continue;
    ctx.put(mid, y, wallZ, "chiseled_stone_bricks");
    c.n++;
  }
  // The shrine: a stone sill under the niche with an unlit candle on it.
  if (c.put1(mid, end.z, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" })) {
    c.stack(mid, end.z, 2, "white_candle", CANDLES(1));
  }
  c.put1(mid + 1 <= it.x1 ? mid + 1 : mid, end.z, "lectern", {
    facing: opposite(end.look),
    has_book: "false",
    powered: "false",
  });
  // The cot: head against the side wall, at the door end of the cell.
  const cotZ = end.z === it.z0 ? it.z1 : it.z0;
  if (it.x0 + 1 <= it.x1) ctx.placeBed(it.x0 + 1, cotZ, "west", "white_bed");
  c.put1(it.x1, cotZ, "barrel", { facing: "up", open: "false" });
}

/* -------------------------------------------------------------------------- */
/* the other traditions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `mosque` — a mihrab, prayer rows and a minbar. Nothing figural.
 *
 * The three reads, each one honest:
 *
 * - the **mihrab**: a niche in the middle of the qibla wall, re-clad in
 *   dressed stone, with upturned stairs at its head suggesting the arch. It is
 *   in the wall *plane*, so it costs no floor;
 * - the **prayer rows**: carpet laid in rows **across** the room rather than
 *   down it, because a congregation stands in ranks facing the mihrab. Carpet
 *   is passable, so the rows are floor and not obstacles — and there are no
 *   seats in this building at all;
 * - the **minbar**: a short stair run of two steps beside the mihrab, laid
 *   with the tread rising towards the qibla wall and never so tall that a
 *   stander loses headroom.
 */
function fitMosque(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const wallZ = end.z === it.z0 ? it.z0 - 1 : it.z1 + 1;

  // The mihrab, in the qibla wall: three courses of dressed stone.
  for (let y = 1; y <= Math.min(3, ctx.wallTop - 1); y++) {
    const standing = ctx.blockAt(mid, y, wallZ);
    if (standing !== undefined && PRESERVE.test(standing.block)) continue;
    ctx.put(mid, y, wallZ, "chiseled_stone_bricks");
    c.n++;
  }
  // The arch: upturned stairs either side of the niche head, leaning in.
  const archY = Math.min(4, ctx.wallTop);
  const stone = ctx.style["stone.stairs"] as string;
  for (const [ax, facing] of [
    [mid - 1, "west"],
    [mid + 1, "east"],
  ] as const) {
    if (ax < it.x0 || ax > it.x1) continue;
    const standing = ctx.blockAt(ax, archY, wallZ);
    if (standing !== undefined && PRESERVE.test(standing.block)) continue;
    ctx.put(ax, archY, wallZ, stone, { facing, half: "top", shape: "straight" });
    c.n++;
  }

  // The prayer rows: carpet across the room, every other rank — and inside
  // the perimeter ring, so a lane runs round the whole hall against the walls
  // and no rank ever cuts the floor in two.
  // The row against each end wall is left bare as well: the corners of that
  // row carry props, and a rank of carpet immediately inside it would cut the
  // strip between them off from the lanes down the side walls.
  //
  // Each rank is also **broken at the centre column**, which is both the honest
  // read — the walk from the door to the mihrab — and the thing that keeps the
  // hall one region: the lanes down the side walls can be interrupted by a
  // prop, the centre one cannot, because nothing in this fit-out stands in it.
  const aisleX = lanternColumn(it).x;
  for (let z = it.z0 + 2; z <= it.z1 - 2; z += 2) {
    for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
      // Two columns wide, so the walk survives the one cell the lantern's
      // column takes out of it.
      if (x === aisleX || x === aisleX + 1) continue;
      c.put1(x, z, (x + z) % 4 === 0 ? "green_carpet" : "red_carpet");
    }
  }

  // The minbar: two steps up towards the qibla wall, beside the mihrab.
  const step = ctx.style["stone.stairs"] as string;
  const mx = mid + 2 <= it.x1 ? mid + 2 : mid - 2;
  if (mx >= it.x0 && mx <= it.x1) {
    const near = end.z === it.z0 ? it.z0 + 1 : it.z1 - 1;
    const far = end.z;
    // The tread rises towards the wall; nothing stands over the top step, so
    // a preacher on it keeps their head.
    c.put1(mx, near, step, { facing: end.look, half: "bottom", shape: "straight" });
    c.put1(mx, far, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" });
  }
  c.put1(it.x0, end.z, "barrel", { facing: "up", open: "false" });
}

/**
 * `synagogue` — a bimah in the middle and the ark on the far wall.
 *
 * The bimah is a **dais**: two slab cells with a lectern on one, set one cell
 * off the room's centre because the centre is the lantern column. The ark is a
 * cabinet against the far wall — dressed stone re-clad in the wall plane with
 * a pair of trapdoor doors hung on it — and the benches are two ranks either
 * side of the bimah, each turned so its sitters look at it.
 */
function fitSynagogue(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const wallZ = end.z === it.z0 ? it.z0 - 1 : it.z1 + 1;
  const mid = lamp.x;

  // The ark, in the wall plane, with its doors hung on the room side.
  for (let y = 1; y <= Math.min(3, ctx.wallTop - 1); y++) {
    const standing = ctx.blockAt(mid, y, wallZ);
    if (standing !== undefined && PRESERVE.test(standing.block)) continue;
    ctx.put(mid, y, wallZ, "chiseled_stone_bricks");
    c.n++;
  }
  const trapdoor = ctx.style["wall.trapdoor"] as string;
  for (const ax of [mid - 1, mid + 1]) {
    if (ax < it.x0 || ax > it.x1) continue;
    const standing = ctx.blockAt(ax, 2, wallZ);
    if (standing !== undefined && PRESERVE.test(standing.block)) continue;
    ctx.put(ax, 2, wallZ, trapdoor, shutter(opposite(end.look)));
    c.n++;
  }

  // The bimah: a dais beside the lantern column, never under it, with the
  // reading desk on it turned to the congregation.
  const dz = lamp.z + 1 <= it.z1 - 1 ? lamp.z + 1 : lamp.z - 1;
  const slabBlock = ctx.style["stone.slab"] as string;
  c.put1(mid, dz, slabBlock, { type: "top", waterlogged: "false" });
  if (mid - 1 >= it.x0) c.put1(mid - 1, dz, slabBlock, { type: "top", waterlogged: "false" });
  if (mid + 1 <= it.x1) {
    c.put1(mid + 1, dz, "lectern", {
      facing: opposite(end.look),
      has_book: "false",
      powered: "false",
    });
  }

  // The benches: ranks either side of the bimah, all looking at it.
  const bench = ctx.style["stair.interior"] as string;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z >= dz - 1 && z <= dz + 1) continue;
    if ((z - it.z0) % 2 === 1) continue;
    // A sitter north of the dais looks south towards it, and the other way
    // round on the far side — the seat rule, applied per rank.
    const look: Cardinal = z < dz ? "south" : "north";
    for (const bx of [mid - 2, mid + 2]) {
      if (bx <= it.x0 || bx >= it.x1) continue;
      c.put1(bx, z, bench, seat(look));
    }
  }
  c.put1(it.x0, end.z, "bookshelf");
}

/**
 * `stupa` — a solid dome on a plinth ring, walked around rather than into.
 *
 * The dome is {@link corbel} at two courses per inset, which swells rather
 * than points, closing on a solid cap with a spire finial standing on it. The
 * drum below it is re-clad masonry with a **plinth band** of slabs in the
 * apron: the ring a stupa sits on.
 *
 * Inside, the building is a **circumambulation**: a solid core in the middle
 * of the floor and a clear lane all the way round it, between the core and the
 * walls. The core deliberately leaves the exact centre alone — that is the
 * lantern's column — and every other cell of it goes through the prop counter,
 * so a core that would strand any part of the lane is simply not built.
 */
function fitStupa(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, masonry(ctx));
    const slabBlock = ctx.style["stone.slab"] as string;
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      // The plinth band stands on the ground the apron actually has.
      const y = ctx.blockAt(cell.x, 0, cell.z) === undefined ? 0 : 1;
      ctx.put(cell.x, y, cell.z, slabBlock, { type: "bottom", waterlogged: "false" });
      c.n++;
    }
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    const accent = ctx.style["foundation.accent"] as string;
    const primary = ctx.style["foundation.primary"] as string;
    // Two courses per inset: a dome. The finial is a partial block standing
    // directly on the solid cap, which is the one place one belongs.
    c.n += corbel(
      ctx,
      roof,
      (x, y, z) => ((x + y + z) % 5 === 0 ? accent : primary),
      accent,
      2,
      ctx.style["stone.wall"] as string,
    );
  }

  // The core, and the lane round it.
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  for (let z = lamp.z - 1; z <= lamp.z + 1; z++) {
    for (let x = lamp.x - 1; x <= lamp.x + 1; x++) {
      if (x === lamp.x && z === lamp.z) continue; // the lantern's column
      if (x < it.x0 + 1 || x > it.x1 - 1 || z < it.z0 + 1 || z > it.z1 - 1) continue;
      c.put1(x, z, "chiseled_stone_bricks");
    }
  }
  const end = farEnd(ctx);
  c.put1(it.x0, end.z, "white_candle", CANDLES(3));
  c.put1(it.x1, end.z, pottedAt(it.x1, end.z));
}

/**
 * `ziggurat` — stepped terraces with a shrine cell on the crown.
 *
 * The roof is the pueblo's terrace idiom **stacked**: two or three solid decks,
 * each inset one further than the one below and each with its riser carried up
 * to it, all inside `roofTop + ROOF_FLOURISH_RISE`. The top tier carries the
 * shrine — a ring of dressed stone with an altar block and unlit candles in
 * the middle of it, standing on the solid deck under it.
 */
function fitZiggurat(ctx: FitOutContext, c: PropCounter): void {
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    const deck = ctx.style["foundation.primary"] as string;
    const riser = ctx.style["foundation.accent"] as string;
    const top = tiers(ctx, roof, deck, riser);
    c.n += 1;
    // The shrine cell, on the crown: a rim of dressed stone with an altar in
    // it, all standing on the tier's own solid deck.
    const sx = (top.rect.x0 + top.rect.x1) >> 1;
    const sz = (top.rect.z0 + top.rect.z1) >> 1;
    if (top.y + 1 <= roof.top) {
      for (let x = top.rect.x0; x <= top.rect.x1; x++) {
        for (let z = top.rect.z0; z <= top.rect.z1; z++) {
          const rim = x === top.rect.x0 || x === top.rect.x1 || z === top.rect.z0 || z === top.rect.z1;
          if (!rim) continue;
          ctx.put(x, top.y + 1, z, "chiseled_stone_bricks");
          c.n++;
        }
      }
      ctx.put(sx, top.y + 1, sz, "chiseled_stone_bricks");
      if (top.y + 2 <= roof.top) {
        ctx.put(sx, top.y + 2, sz, "white_candle", CANDLES(2));
        c.n++;
      }
    }
  }
  const wall = wallPlan(ctx);
  if (wall !== null) c.n += reclad(ctx, wall, 1, 2, masonry(ctx));

  // Inside, the processional: a runner up the middle to an altar at the end.
  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const end = farEnd(ctx);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) c.put1(mid, z, "orange_carpet");
  altarAt(ctx, c, mid, end.z, end.look);
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, "barrel", { facing: "up", open: "false" });
}

/* -------------------------------------------------------------------------- */
/* the towers, and the tomb                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Hang a bell at the head of the shaft, under something solid.
 *
 * The rule this obeys is the one a chain and a lantern obey too: a hanging
 * block needs an actual block above it. So the bell goes one course under the
 * ceiling plane and only where the cell above it is already built — otherwise
 * it is a bell floating in a tower, which the physics lint reports and is
 * right to. Returns whether it landed.
 */
function hangBell(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  const y = ctx.wallTop - 1;
  if (y < 2) return false;
  const it = ctx.interior;
  // The **lantern already hangs in the middle column at that height**, so the
  // centre is tried and then given up on rather than overwritten: a bell that
  // replaces the room's light is a bell that cost the room its light.
  const columns: readonly (readonly [number, number])[] = [
    [x, z],
    [x - 1, z],
    [x + 1, z],
    [x, z - 1],
    [x, z + 1],
  ];
  for (const [bx, bz] of columns) {
    if (bx < it.x0 || bx > it.x1 || bz < it.z0 || bz > it.z1) continue;
    if (ctx.blockAt(bx, y, bz) !== undefined) continue;
    // A hanging block needs an actual block over it, or it is a bell in mid air.
    if (ctx.blockAt(bx, y + 1, bz) === undefined) continue;
    ctx.put(bx, y, bz, "bell", { attachment: "ceiling", facing: "north", powered: "false" });
    c.n++;
    return true;
  }
  return false;
}

/**
 * `bell_tower` — a tall thin shaft with the bell at the head of it.
 *
 * The wizard tower's proportions, without the wizard: masonry from plinth to
 * plate, the shell's own ladder or stair left exactly where it is (a re-clad
 * that paints over the way up is a tower nobody can climb — hence the
 * {@link PRESERVE} list), and the bell hung under the ceiling plane at the top
 * of the shaft. The floor keeps a ringer's corner: a chest of ropes and a
 * bench turned to the shaft.
 */
function fitBellTower(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, masonry(ctx));
    // The belfry openings: a louvre band of trapdoors in the apron under the
    // plate, hung on the wall that is already there.
    const trapdoor = ctx.style["wall.trapdoor"] as string;
    const louvreY = Math.max(2, ctx.wallTop - 2);
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const facing: Cardinal =
        cell.x === -1 ? "east" : cell.x === wall.sx ? "west" : cell.z === -1 ? "south" : "north";
      ctx.put(cell.x, louvreY, cell.z, trapdoor, shutter(facing));
      c.n++;
    }
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  hangBell(ctx, c, lamp.x, lamp.z);
  const end = farEnd(ctx);
  c.put1(it.x0, end.z, "chest", { facing: "east", type: "single" });
  c.put1(it.x1, end.z, ctx.style["stair.interior"] as string, seat(end.look));
}

/**
 * `minaret` — the bell tower slimmed, with a balcony and a crescent.
 *
 * Three differences and that is all a minaret is: the shaft is re-clad in the
 * same masonry, a **balcony ring** of trapdoors runs round the apron near the
 * top (hung on the wall below the plate, so every one of them has support),
 * and the cap is a steep corbelled cone closing on a solid block with a spike
 * standing on it — the crescent, suggested rather than modelled.
 */
function fitMinaret(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, masonry(ctx));
    const trapdoor = ctx.style["wall.trapdoor"] as string;
    const balconyY = Math.max(2, ctx.wallTop - 1);
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const facing: Cardinal =
        cell.x === -1 ? "east" : cell.x === wall.sx ? "west" : cell.z === -1 ? "south" : "north";
      ctx.put(cell.x, balconyY, cell.z, trapdoor, shutter(facing));
      c.n++;
    }
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    const accent = ctx.style["foundation.accent"] as string;
    const primary = ctx.style["foundation.primary"] as string;
    // One course per inset: a cone rather than a dome. Solid cap, spike on it.
    c.n += corbel(
      ctx,
      roof,
      (x, y, z) => ((x + y + z) % 4 === 0 ? accent : primary),
      accent,
      1,
      "end_rod",
    );
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  c.put1(it.x0, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, end.z, pottedAt(it.x1, end.z));
}

/**
 * `tomb` — the mausoleum's quieter cousin.
 *
 * One chamber, sealed-feeling: masonry to the plate with a slab course in the
 * apron at the plinth head, so the box reads as a lid on a base. Inside is a
 * **cist** — a stone bier of two cells with a slab lid, offset from the middle
 * so the lantern column stays clear — and unlit candles at its head. Nothing
 * else, because a memorial that is busy is not a memorial.
 *
 * The archetype is reached by `burial_chamber` and `cist`: `tomb` and
 * `sepulchre` are the mausoleum's tags and stay the mausoleum's.
 */
function fitTomb(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 1, ctx.wallTop, masonry(ctx));
    const slabBlock = ctx.style["stone.slab"] as string;
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const y = ctx.blockAt(cell.x, 0, cell.z) === undefined ? 0 : 1;
      ctx.put(cell.x, y, cell.z, slabBlock, { type: "bottom", waterlogged: "false" });
      c.n++;
    }
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  // The cist, laid along z one column off the centre: the lantern hangs over
  // the centre, and a bier under a lantern is a bier nobody can stand beside.
  const bx = lamp.x - 1 >= it.x0 ? lamp.x - 1 : lamp.x + 1;
  const slabBlock = ctx.style["stone.slab"] as string;
  for (const bz of [lamp.z, lamp.z + 1]) {
    if (bz < it.z0 || bz > it.z1) continue;
    c.put1(bx, bz, slabBlock, { type: "top", waterlogged: "false" });
  }
  c.put1(bx, end.z, "chiseled_stone_bricks");
  c.put1(it.x0, end.z, "white_candle", CANDLES(3));
  c.put1(it.x1, end.z, "gray_candle", CANDLES(2));
}

/* -------------------------------------------------------------------------- */
/* descriptor seam — building registry handle (Phase 4, no self-registration)   */
/* -------------------------------------------------------------------------- */

/**
 * Ordered building descriptors for the faith pack — one row per local id, in
 * `FAITH_BUILDING_ARCHETYPES` order (catalog order). No realization change:
 * furnish stays `furnishFaith`, facade defaults delegate to
 * `faithFacadeDefaults`, and tags preserve the matching semantics from
 * `faithArchetypeOfTags`.
 *
 * Priority note — tomb/abbey: `tomb` (`burial_chamber`/`cist`) does NOT claim
 * bare `tomb`/`sepulchre` (those stay the blitz mausoleum's); `abbey` claims
 * only bare `abbey` and is distinct from relic's `ruined_abbey`/`abbey_ruin`
 * compounds. Insertion order in the central `archetypeOfTags` chain is
 * faith after relic/spectacle/arcana/depths and before sanctum — preserved by
 * registering this array in that position.
 */
export const FAITH_BUILDING_DESCRIPTORS = defineBuildingDescriptors(FAITH_BUILDING_ARCHETYPES, {
  tags: {
    cathedral: ["cathedral", "minster", "basilica"],
    monastery: ["monastery", "friary"],
    abbey: ["abbey"],
    cloister: ["cloister", "garth"],
    hermitage: ["hermitage", "hermit"],
    mosque: ["mosque", "masjid"],
    synagogue: ["synagogue", "shul"],
    stupa: ["stupa"],
    ziggurat: ["ziggurat"],
    bell_tower: ["bell_tower", "campanile", "belfry"],
    minaret: ["minaret"],
    tomb: ["burial_chamber", "cist"],
  },
  facadeDefaults: faithFacadeDefaults,
  furnish: furnishFaith,
  dispatch: "standard",
});
