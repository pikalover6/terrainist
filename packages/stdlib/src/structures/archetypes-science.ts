/**
 * Archetype breadth, **wave 5D** — science and modern living.
 *
 * `archetypes-blitz.ts` states the design law every file in this family obeys:
 * **an archetype is a fit-out, not a second grammar.** A fit-out runs after
 * every shape stage — foundation, walls, windows, floors, roof, chimney — and
 * writes into the same cell map they did, where a later write to a cell
 * replaces an earlier one. So a planetarium is the house shell with its head
 * gone dark and a ring of seats turned inward under it; a penthouse is the
 * dwelling with its top surface opened; a seed vault is the store room gone
 * civil. None of them is a new shell.
 *
 * Twelve buildings, in two groups:
 *
 * - **science** — `telescope_dome`, `planetarium`, `alchemy_lab`, `herbarium`,
 *   `aviary`, `botanical_garden`, `seed_vault`, `weather_station`,
 *   `field_station`;
 * - **modern** — `penthouse`, `atrium_block`, `modern_villa`.
 *
 * ## Against the blitz observatory
 *
 * `telescope_dome` is not a second observatory. The blitz one is the **old**
 * instrument house: a stepped dome of the theme's roof stone, insetting two
 * courses at a time, with a one-cell slit and an end-rod telescope under it.
 * This one is the **modern** dome — smooth quartz right through, a **two-cell**
 * slit rather than one, a real masonry **pier** carrying the instrument rather
 * than a plinth on the floor, and a control desk beside it. The tags are
 * disjoint: `observatory`, `telescope` and `astronomy` remain the blitz
 * building's, and nothing here answers to them.
 *
 * ## The field lessons this file was written against
 *
 * Every one of these is a rule below rather than a comment:
 *
 * - a **stair's `facing` is its high half** — the backrest. The planetarium's
 *   ring therefore carries the cardinal pointing **outward**, because its
 *   audience looks **inward** at the projector;
 * - a bare `flower_pot` renders empty; {@link pottedAt} (wave two's, imported)
 *   picks a `potted_*` from position;
 * - the shell hangs a lantern over the **middle column** of the room at head
 *   height, so nothing central ever stands under it: the planetarium's
 *   projector and the dome's pier are both **offset by one**;
 * - the trestle idiom is refused by the stack guard under a three-course
 *   storey, so {@link table} switches to a top slab;
 * - a body-blocking prop on a one-wide circulation ring seals it, so nothing
 *   stands in a lane, and a standable needs headroom;
 * - **no sign blocks** — a label is a wall banner;
 * - **no open water** except through the boxed-pool predicate: the botanical
 *   pond is written into the floor plane, inset from the interior on every
 *   side, and rimmed with a coping course, or it is not written at all;
 * - **apron props are grounded** — {@link apronPost} fills `y = 0` when the
 *   cell has nothing under it, so a windsock pole is never a floating column;
 * - a corbel dome ends in a **solid cap**; a rod or a spike stands **on** it;
 * - **no `chain`** — the block table does not carry one. Iron bars instead.
 */

import type { Cardinal, LocalRect } from "./core.js";
import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
  roofPlan,
  wallPlan,
  type RebuildPlan,
} from "./archetypes-civic.js";
import { pottedAt } from "./archetypes-wave2.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The twelve archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`: the nine science ones
 * first, then the three modern ones.
 */
export const SCIENCE_BUILDING_ARCHETYPES = [
  "telescope_dome",
  "planetarium",
  "alchemy_lab",
  "herbarium",
  "aviary",
  "botanical_garden",
  "seed_vault",
  "weather_station",
  "field_station",
  "penthouse",
  "atrium_block",
  "modern_villa",
] as const;

/** One of the archetypes this file fits out. */
export type ScienceBuildingArchetype = (typeof SCIENCE_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isScienceArchetype(value: string): value is ScienceBuildingArchetype {
  return (SCIENCE_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the dwellings and *before* the extended table, for the reason
 * every later wave sits there: the tables under it are greedy. Every near miss
 * below is deliberate, and each one would otherwise have been a silent theft:
 *
 * - `observatory`, `telescope` and `astronomy` are the **blitz observatory's**,
 *   so the modern dome answers to `telescope_dome` and `dome_observatory` only;
 * - `alchemist` (with `apothecary`, `pharmacy` and `herbalist`) is the **trade
 *   apothecary's**, so the arcane lab takes `alchemy_lab` and `alchemy` and
 *   leaves the older, more medical claim alone;
 * - `lab` and `laboratory` are **wave 4C's laboratory**, and the alchemy lab
 *   never reaches for either;
 * - bare `villa` is the **Mediterranean villa's** (wave two), so the flat-roof
 *   one is `modern_villa` and `minimalist`;
 * - `garden` is left unclaimed for the catalog's formal gardens — the
 *   botanical one is a compound, plus `botanic` and `arboretum`;
 * - `station` alone belongs to no table here: a weather station is
 *   `weather_station`/`met_station` and a field station
 *   `field_station`/`research_station`, so a railway station stays free to
 *   claim the bare word later.
 */
export function scienceArchetypeOfTags(
  tags: readonly string[],
): ScienceBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("telescope_dome") || has("dome_observatory")) return "telescope_dome";
  if (has("planetarium") || has("star_dome")) return "planetarium";
  if (has("alchemy_lab") || has("alchemy")) return "alchemy_lab";
  if (has("herbarium")) return "herbarium";
  if (has("aviary") || has("birdhouse")) return "aviary";
  if (has("botanical_garden") || has("botanic") || has("arboretum")) return "botanical_garden";
  if (has("seed_vault") || has("genebank")) return "seed_vault";
  if (has("weather_station") || has("met_station")) return "weather_station";
  if (has("field_station") || has("research_station")) return "field_station";
  if (has("penthouse")) return "penthouse";
  if (has("atrium_block") || has("atrium")) return "atrium_block";
  if (has("modern_villa") || has("minimalist")) return "modern_villa";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 */
export function scienceFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // Both domes rebuild the roof anyway; ask for the shape that leaves the
    // most room in the air above the plate.
    case "telescope_dome":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // A room built to be dark, under a dome.
    case "planetarium":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "alchemy_lab":
      return { windowShape: "tall", windowRhythm: "paired", roof: "gable" };
    case "herbarium":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    // Light and air, and a lot of both.
    case "aviary":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    case "botanical_garden":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "hip" };
    // A bunker has as few holes in it as the grammar will allow.
    case "seed_vault":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "weather_station":
      return { windowShape: "single", windowRhythm: "regular", roof: "hip" };
    case "field_station":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // The modern three are all about the glass and the flat top.
    case "penthouse":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "flat" };
    case "atrium_block":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "flat" };
    case "modern_villa":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "flat" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the exterior plan                                                           */
/* -------------------------------------------------------------------------- */

/** Blocks a re-clad may never overwrite: the way in, the way up, the fire, the lights. */
const KEEP_AS_IS =
  /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

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

/** The step of a cardinal, as `[dx, dz]`. */
function step(facing: Cardinal): readonly [number, number] {
  switch (facing) {
    case "north":
      return [0, -1];
    case "south":
      return [0, 1];
    case "east":
      return [1, 0];
    default:
      return [-1, 0];
  }
}

/**
 * The cell a player stands in to open the door, or `null` when there is none.
 *
 * The one apron cell nothing in this file may ever fill. The physics lint walks
 * a building **from its door**; a windsock pole on the doorstep is a building
 * with no way in.
 */
function outsideDoor(ctx: FitOutContext): { readonly x: number; readonly z: number } | null {
  if (ctx.door === null) return null;
  const [dx, dz] = step(ctx.door.face);
  return { x: ctx.door.x + dx, z: ctx.door.z + dz };
}

/**
 * Write a block on a wall-ring cell, unless what stands there is load-bearing.
 *
 * Returns whether it landed, so a caller's count is the count of cells it
 * actually changed rather than the count it looked at.
 */
function clad(ctx: FitOutContext, x: number, y: number, z: number, block: string): boolean {
  const standing = ctx.blockAt(x, y, z);
  if (standing !== undefined && KEEP_AS_IS.test(standing.block)) return false;
  ctx.put(x, y, z, block);
  return true;
}

/** Re-clad the whole wall ring between two courses, from a position function. */
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
      if (clad(ctx, cell.x, y, cell.z, block(cell.x, y, cell.z))) n++;
    }
  }
  return n;
}

/**
 * Clear everything the shell built above the eave plate, apron included.
 *
 * Two courses past `top` as well, for the chimney corbel and its chimney-pot
 * campfire: a replacement roof that cleared only to its own ceiling would leave
 * a fire burning over the ridge it deleted.
 */
function clearRoof(ctx: FitOutContext, plan: RebuildPlan): void {
  for (let y = plan.base; y <= plan.top + 2; y++) {
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) ctx.put(x, y, z, "air");
    }
  }
}

/** Fill an inclusive rect at one Y. */
function slabRect(
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
 * Corbel a dome over the envelope, closing on a **solid** cap.
 *
 * The regional file's machinery, restated at this seam and given the one thing
 * an instrument dome needs that a trullo cone does not: `slit`, a run of
 * columns left open on the north half of every ring. The cap is always filled —
 * a partial block in the middle of the rect has nothing under it but the dome's
 * hollow, and the lint's support-chain rule rightly calls that floating. The
 * one place a partial block belongs is the finial, standing **on** the cap.
 *
 * `courses` is how many courses are laid before the ring steps in: 1 is a cone,
 * 2 the swelling dome both of this file's observatories want.
 */
function corbelDome(
  ctx: FitOutContext,
  plan: RebuildPlan,
  block: (x: number, y: number, z: number) => string,
  cap: string,
  courses = 2,
  slit?: (x: number, z: number, sz: number) => boolean,
): { readonly n: number; readonly capY: number; readonly rect: LocalRect } {
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
      // The first course is the lid of the room below: solid, with the slit
      // cut through it so the instrument has sky.
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (slit?.(x, z, plan.sz) === true) continue;
          ctx.put(x, y, z, block(x, y, z));
        }
      }
      continue;
    }
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
        if (slit?.(x, z, plan.sz) === true) continue;
        ctx.put(x, y, z, block(x, y, z));
      }
    }
  }
  // THE CAP IS SOLID. Unconditionally, and with no slit cut in it: the crown
  // of a corbel is the one course that plugs the ring below it.
  slabRect(ctx, capY, rect.x0, rect.x1, rect.z0, rect.z1, cap);
  n++;
  return { n, capY, rect };
}

/**
 * A flat deck at the course above the ceiling plane, with a parapet on it.
 *
 * The regional terrace, restated. The deck is a **solid** course over the whole
 * footprint, so the parapet has something under it everywhere it stands.
 */
function terrace(
  ctx: FitOutContext,
  plan: RebuildPlan,
  deck: string,
  parapet: (x: number, z: number) => { readonly block: string; readonly height: number },
  props?: Record<string, string>,
): number {
  let n = 0;
  slabRect(ctx, plan.base, 0, plan.sx - 1, 0, plan.sz - 1, deck);
  n += plan.sx * plan.sz;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    const wall = parapet(cell.x, cell.z);
    for (let h = 1; h <= wall.height; h++) {
      const y = plan.base + h;
      if (y > plan.top) break;
      ctx.put(cell.x, y, cell.z, wall.block, props);
      n++;
    }
  }
  return n;
}

/**
 * A post in the apron, grounded.
 *
 * The stilt lesson: an apron cell may have nothing under it, and a post that
 * starts at `y = 1` there is a column standing on air, which the lint's
 * support-chain rule refuses. Filling `y = 0` first closes the gap.
 */
function apronPost(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  z: number,
  block: string,
  toY: number,
): void {
  if (ctx.blockAt(x, 0, z) === undefined) c.raw(x, 0, z, block);
  for (let y = 1; y <= toY; y++) c.raw(x, y, z, block);
}

/* -------------------------------------------------------------------------- */
/* interior primitives                                                         */
/* -------------------------------------------------------------------------- */

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
 * The end of the room furthest from the door.
 *
 * Returns the z of that end and the cardinal a person standing in the room
 * faces to look at it.
 */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/** The middle column of the room — where the shell hangs its lantern. */
function lanternColumn(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
}

/**
 * The cell a centrepiece stands in: the middle of the room, **offset by one**.
 *
 * The shell hangs a lantern over the middle column at head height, and a prop
 * under it seals the cell — that is the library's lesson, and it is the reason
 * neither the dome's pier nor the planetarium's projector is central. One cell
 * east, unless the room is too narrow for that, in which case one cell south.
 */
function centrepieceCell(it: LocalRect): { readonly x: number; readonly z: number } {
  const lamp = lanternColumn(it);
  if (lamp.x + 1 <= it.x1 - 1) return { x: lamp.x + 1, z: lamp.z };
  if (lamp.z + 1 <= it.z1 - 1) return { x: lamp.x, z: lamp.z + 1 };
  return { x: lamp.x, z: lamp.z };
}

/**
 * One table cell, by the idiom the storey has headroom for.
 *
 * Wave two's rule, unchanged: the trestle — a fence stem with a plate on it —
 * is two blocks in one column, and under a three-course storey the second is
 * refused by the stack guard as an `interior.blocked_column`, leaving a bare
 * fence post that reads as a bollard. A top slab is one block at table height.
 */
function table(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  if (ctx.storyHeight < 4) {
    return c.put1(x, z, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" });
  }
  if (!c.put1(x, z, ctx.style["wall.fence"] as string)) return false;
  c.stack(x, z, 2, "oak_pressure_plate", { powered: "false" });
  return true;
}

/**
 * A bank of rows facing the far end — wave 4C's discipline, imported by copy.
 *
 * Three constraints are built in, and every one of them came back from a
 * walkthrough: a **three-column aisle** centred on the lantern column, a
 * **one-cell clear lane** around the whole field inside the walls, and
 * **alternate rows only**, so a body can get out of a row without climbing the
 * next one.
 */
function bankCells(
  ctx: FitOutContext,
  end: { readonly z: number; readonly look: Cardinal },
  startGap = 2,
  step2 = 2,
): { readonly x: number; readonly z: number; readonly row: number }[] {
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const aisle0 = Math.max(it.x0, lamp.x - 1);
  const aisle1 = Math.min(it.x1, lamp.x + 1);
  const dir = end.look === "north" ? 1 : -1;
  const out: { x: number; z: number; row: number }[] = [];
  for (let k = startGap, row = 0; ; k += step2, row++) {
    const z = end.z + dir * k;
    if (z < it.z0 + 1 || z > it.z1 - 1) break;
    for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
      if (x >= aisle0 && x <= aisle1) continue;
      out.push({ x, z, row });
    }
  }
  return out;
}

/**
 * Recolour the floor plane over an inclusive rect.
 *
 * A carpet is a block at `y = 1`, which costs the room a walkable cell for
 * every cell of rug; the floor plane costs nothing and reads the same from a
 * standing eye. Every rug, runner, chalk circle and court in this file is
 * written this way.
 */
function floorPaint(
  ctx: FitOutContext,
  rect: LocalRect,
  block: (x: number, z: number) => string | null,
): number {
  let n = 0;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const b = block(x, z);
      if (b === null) continue;
      ctx.put(x, 0, z, b);
      n++;
    }
  }
  return n;
}

/** True when a seat, which is a step a body mounts, has room for the body. */
function benchHeadroom(ctx: FitOutContext): boolean {
  return ctx.floors < 2 || ctx.storyHeight >= 4;
}

/** Chebyshev distance — the square "radius" every ring in this file uses. */
function ringDistance(x: number, z: number, cx: number, cz: number): number {
  return Math.max(Math.abs(x - cx), Math.abs(z - cz));
}

/**
 * The cardinal pointing **away** from a centre.
 *
 * The planetarium's whole seat rule in one function: a stair's `facing` is its
 * backrest, so a seat whose sitter looks **inward** carries the cardinal that
 * points **outward**.
 */
function outwardFrom(x: number, z: number, cx: number, cz: number): Cardinal {
  const dx = x - cx;
  const dz = z - cz;
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? "east" : "west";
  return dz >= 0 ? "south" : "north";
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
export function furnishScience(ctx: FitOutContext): number {
  if (!isScienceArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "telescope_dome":
      fitTelescopeDome(ctx, c);
      break;
    case "planetarium":
      fitPlanetarium(ctx, c);
      break;
    case "alchemy_lab":
      fitAlchemyLab(ctx, c);
      break;
    case "herbarium":
      fitHerbarium(ctx, c);
      break;
    case "aviary":
      fitAviary(ctx, c);
      break;
    case "botanical_garden":
      fitBotanicalGarden(ctx, c);
      break;
    case "seed_vault":
      fitSeedVault(ctx, c);
      break;
    case "weather_station":
      fitWeatherStation(ctx, c);
      break;
    case "field_station":
      fitFieldStation(ctx, c);
      break;
    case "penthouse":
      fitPenthouse(ctx, c);
      break;
    case "atrium_block":
      fitAtriumBlock(ctx, c);
      break;
    case "modern_villa":
    default:
      fitModernVilla(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* science                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `telescope_dome` — the modern white dome, and everything the old one is not.
 *
 * The blitz observatory is the historic instrument house: theme roof stone,
 * a one-cell slit, an end-rod telescope standing on a plinth on the floor.
 * This is the twentieth-century one, and the four differences are the design:
 *
 * - the shell is **smooth quartz** through the dome *and* down the wall ring
 *   above the plinth course, so the building reads white from the ground;
 * - the slit is **two cells wide**, which is what a real shutter is, and it is
 *   cut through the dome's first course as well as its rings;
 * - the instrument stands on a **pier**: a masonry column from the floor with
 *   the mount on top of it, offset one cell off the lantern so the light lane
 *   stays clear;
 * - there is a **control desk** beside the pier — a cartography table, a
 *   lectern and a chart shelf, because a modern telescope is operated rather
 *   than looked through.
 */
function fitTelescopeDome(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const plan = roofPlan(ctx);
  const pier = centrepieceCell(it);

  if (plan !== null) {
    clearRoof(ctx, plan);
    // The two-cell shutter, on the north half, aligned on the pier's column.
    const slitX = Math.min(Math.max(pier.x, 1), plan.sx - 2);
    const slit = (x: number, z: number, sz: number): boolean =>
      (x === slitX || x === slitX + 1) && z <= (sz - 1) / 2;
    c.n += corbelDome(
      ctx,
      plan,
      (x, y, z) => ((x + y + z) % 9 === 0 ? "quartz_bricks" : "smooth_quartz"),
      "smooth_quartz",
      2,
      slit,
    ).n;
    // The white wall: quartz above the plinth course, so the drum matches the
    // dome. The glazing and the door are preserved by `clad`.
    const wallPlanOnly = wallPlan(ctx);
    if (wallPlanOnly !== null) {
      c.n += reclad(ctx, wallPlanOnly, 2, ctx.wallTop, (x, y, z) =>
        (x + y * 3 + z) % 11 === 0 ? "quartz_pillar" : "smooth_quartz",
      );
    }
  }

  // The pier: masonry from the floor, the mount on top of it, and the rod
  // that reads as the barrel above that.
  if (c.put1(pier.x, pier.z, "smooth_quartz")) {
    if (!c.stack(pier.x, pier.z, 2, "lightning_rod", { facing: "up", powered: "false" })) {
      c.stack(pier.x, pier.z, 2, "end_rod", { facing: "up" });
    }
  }

  // The control desk, against the far wall. Laid left to right rather than at
  // one named cell: the ground floor's own reserve — the door approach, the
  // stair columns, the hearth breast — refuses whichever cells it refuses, and
  // a desk pinned to a corner is a desk that some envelopes simply do not get.
  const end = farEnd(ctx);
  const look: Cardinal = end.look === "north" ? "south" : "north";
  let desk = 0;
  for (let x = it.x0; x <= it.x1 && desk < 3; x++) {
    const landed =
      desk === 0
        ? c.put1(x, end.z, "cartography_table")
        : desk === 1
          ? c.put1(x, end.z, "lectern", { facing: look, has_book: "false", powered: "false" })
          : c.put1(x, end.z, "bookshelf");
    if (landed) desk++;
  }
  c.put1(it.x1, end.look === "north" ? it.z1 : it.z0, "barrel", { facing: "up", open: "false" });
}

/**
 * `planetarium` — the dome inverted in purpose.
 *
 * A telescope dome is a hole you look **out** of; a planetarium is a ceiling
 * you look **at**. So everything is turned round:
 *
 * - the dome is closed — **no slit at all** — and drawn in deepslate and
 *   blackstone, with **glowstone flecks** written into the shell itself so the
 *   stars are part of the masonry rather than blocks floating under it;
 * - the upper wall ring is re-clad in the same dark band, so the room goes dark
 *   at the height a seated eye starts looking up;
 * - the seating is a **ring**, and every seat in it faces **outward**, because
 *   `facing` is the backrest and the audience is looking **in**;
 * - the projector stands on a pedestal at the centre of the ring, offset one
 *   cell off the lantern column.
 */
function fitPlanetarium(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const plan = roofPlan(ctx);
  const hub = centrepieceCell(it);

  if (plan !== null) {
    clearRoof(ctx, plan);
    // The star field is a function of position, so it is the same every build.
    c.n += corbelDome(
      ctx,
      plan,
      (x, y, z) =>
        (x * 7 + y * 13 + z * 5) % 17 === 0
          ? "glowstone"
          : (x + y + z) % 5 === 0
            ? "polished_blackstone"
            : "deepslate_tiles",
      "polished_deepslate",
      2,
    ).n;
  }
  const wallPlanOnly = wallPlan(ctx);
  if (wallPlanOnly !== null) {
    // The dark band: the top half of the wall, from a seated eye upward.
    const from = Math.min(3, ctx.wallTop);
    c.n += reclad(ctx, wallPlanOnly, from, ctx.wallTop, (x, y, z) =>
      (x * 3 + y + z * 3) % 7 === 0 ? "polished_blackstone" : "deepslate_tiles",
    );
  }

  // The floor: a dark court under the ring, painted rather than carpeted.
  c.n += floorPaint(ctx, it, (x, z) =>
    ringDistance(x, z, hub.x, hub.z) <= 3 ? "polished_blackstone" : null,
  );

  // The projector, on its pedestal.
  if (c.put1(hub.x, hub.z, "polished_deepslate")) {
    c.stack(hub.x, hub.z, 2, "end_rod", { facing: "up" });
  }

  // THE INWARD RING. Radius two off the hub, so the ring never touches the
  // pedestal and never touches the walls on the envelopes this is built at,
  // and the corners are left out so the ring reads round rather than square —
  // which also keeps a diagonal escape open at every quadrant.
  if (benchHeadroom(ctx)) {
    const seat = ctx.style["stair.interior"] as string;
    for (let z = hub.z - 2; z <= hub.z + 2; z++) {
      for (let x = hub.x - 2; x <= hub.x + 2; x++) {
        if (ringDistance(x, z, hub.x, hub.z) !== 2) continue;
        // The corners of the square ring: left open as the aisles in.
        if (Math.abs(x - hub.x) === 2 && Math.abs(z - hub.z) === 2) continue;
        if (x < it.x0 + 1 || x > it.x1 - 1 || z < it.z0 + 1 || z > it.z1 - 1) continue;
        c.put1(x, z, seat, {
          // Backrest outward: the sitter looks in, at the projector.
          facing: outwardFrom(x, z, hub.x, hub.z),
          half: "bottom",
          shape: "straight",
        });
      }
    }
  }

  // The console and the charts, at the far wall.
  const end = farEnd(ctx);
  c.put1(it.x0, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  c.put1(it.x1, end.z, "bookshelf");
}

/**
 * `alchemy_lab` — the apothecary gone arcane.
 *
 * Wave 4C's laboratory is a school science room: stone benches, a fume hood, a
 * board. This one is the older, stranger cousin, and it never answers to `lab`
 * or `laboratory` — nor to `alchemist`, which is the trade wave's apothecary.
 *
 * Four moves: **brewing bench rows** up both side walls, a **bottle wall** of
 * glass over the shelving at the far end, a **distillation run** — cauldron,
 * bench, brewing stand, in that order along one wall, which is the distillery's
 * still idiom read at room scale — and **chalk circles** written into the floor
 * plane as concentric rings of pale stone, with candles at their quarters.
 */
function fitAlchemyLab(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const hub = centrepieceCell(it);

  // The chalk circle: two concentric rings in the floor plane. A recolour, not
  // a prop — the circle costs the room no walkable cell at all.
  c.n += floorPaint(ctx, it, (x, z) => {
    const d = ringDistance(x, z, hub.x, hub.z);
    if (d === 3) return "calcite";
    if (d === 2) return "polished_diorite";
    return null;
  });

  // The brewing benches, both side walls.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    for (const x of [it.x0, it.x1]) {
      if (!c.put1(x, z, "smooth_stone")) continue;
      if ((z - it.z0) % 3 === 0) {
        c.stack(x, z, 2, "brewing_stand", {
          has_bottle_0: "false",
          has_bottle_1: "false",
          has_bottle_2: "false",
        });
      } else if ((z - it.z0) % 3 === 1) {
        c.stack(x, z, 2, "white_candle", { candles: "2", lit: "true", waterlogged: "false" });
      }
    }
  }

  // The distillation run, along the near end: liquor, bench, still.
  c.put1(it.x0, nearZ, "cauldron", { level: "0" });
  c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, nearZ, "smooth_stone");
  c.put1(it.x1, nearZ, "brewing_stand", {
    has_bottle_0: "false",
    has_bottle_1: "false",
    has_bottle_2: "false",
  });

  // The bottle wall: shelving across the far end with glass over it, and the
  // lantern column left out of the run.
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x) continue;
    if (!c.put1(x, end.z, "bookshelf")) continue;
    c.stack(x, end.z, 2, (x + end.z) % 3 === 0 ? "glass" : "tinted_glass");
  }
  c.put1(lamp.x, end.z, "enchanting_table");
}

/**
 * `herbarium` — a collection of dried plants, catalogued.
 *
 * The whole read is storage of a very particular kind. **Specimen presses** are
 * stacks of trapdoors on the side walls, which is what a press looks like:
 * flat boards clamped one above the next. **Drying racks** are trapdoors hung
 * in the ceiling course over the bench run. The **potted rows** go down the
 * middle-adjacent columns through {@link pottedAt}, never a bare pot. The
 * **cataloguing desk** is a lectern with a chart shelf beside it at the far
 * end, because a herbarium is an index before it is a garden.
 */
function fitHerbarium(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const trapdoor = ctx.style["wall.trapdoor"] as string;
  const rackY = Math.min(2, ctx.storyHeight - 1);

  // The presses: a bench with a trapdoor stack over it, both side walls.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    for (const x of [it.x0, it.x1]) {
      if ((z - it.z0) % 2 === 1) {
        // A drying rack: hung, with nothing under it, so the floor stays clear.
        c.stack(x, z, rackY, trapdoor, {
          facing: x === it.x0 ? "east" : "west",
          half: "top",
          open: "false",
          powered: "false",
          waterlogged: "false",
        });
        continue;
      }
      if (!c.put1(x, z, "bookshelf")) continue;
      c.stack(x, z, 2, trapdoor, {
        facing: x === it.x0 ? "east" : "west",
        half: "bottom",
        open: "false",
        powered: "false",
        waterlogged: "false",
      });
    }
  }

  // The potted rows: one column either side of the aisle, alternate cells, and
  // never the lantern column.
  for (let z = it.z0 + 2; z <= it.z1 - 2; z += 2) {
    for (const x of [lamp.x - 2, lamp.x + 2]) {
      if (x <= it.x0 || x >= it.x1) continue;
      c.put1(x, z, pottedAt(x, z));
    }
  }

  // The cataloguing desk.
  c.put1(lamp.x, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  c.put1(it.x0, end.z, "bookshelf");
  c.put1(it.x1, end.z, "composter", { level: "0" });
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
}

/**
 * `aviary` — a birdhouse read from the inside.
 *
 * The one dangerous idea in this building, and the rule that makes it safe:
 * **the cage encloses the planting, not the route.** A bar ring drawn round a
 * piece of open floor is a pocket by construction — the bars are body-blocking,
 * so the cells they enclose are unreachable air. So every cage here is built
 * **core first**: the cell inside it is filled with leaf and moss (solid, so it
 * is not a standable the walk can fail to reach), and only if that landed is
 * the ring of iron bars drawn round it. A cage whose core was refused is simply
 * not built.
 *
 * `chain` does not exist in the block table, so the hanging read is iron bars
 * throughout. The perches are fences standing **on** the cage core, and the
 * feed is barrels in the near corners.
 */
function fitAviary(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const bars = {
    north: "false",
    south: "false",
    east: "false",
    west: "false",
    waterlogged: "false",
  };

  /** One cage: core first, ring after, or nothing at all. */
  const cage = (cx: number, cz: number): void => {
    if (cx - 1 < it.x0 || cx + 1 > it.x1 || cz - 1 < it.z0 || cz + 1 > it.z1) return;
    // The core is solid planting: a body never stands here, so the walk never
    // needs to reach it.
    if (!c.put1(cx, cz, (cx + cz) % 2 === 0 ? "oak_leaves" : "moss_block")) return;
    for (let z = cz - 1; z <= cz + 1; z++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (x === cx && z === cz) continue;
        c.put1(x, z, "iron_bars", bars);
      }
    }
    // The perch, standing on the core.
    c.stack(cx, cz, 2, ctx.style["wall.fence"] as string);
  };

  // Both cages go in the two **far corners**, against the end wall, and never
  // one down each side. A cage on the west wall halfway down and another on
  // the east wall further along is a pair of body-blocking 3x3s on opposite
  // flanks, and on a tight envelope they meet diagonally and cut the room in
  // half — which is exactly what the walk found. Side by side at one end they
  // leave the whole rest of the floor as one region, with a clear column
  // between them, and they only go in at all when the room is wide enough for
  // that column to exist.
  if (it.x1 - it.x0 >= 6 && it.z1 - it.z0 >= 4) {
    const cz = end.look === "north" ? it.z0 + 1 : it.z1 - 1;
    cage(it.x0 + 1, cz);
    cage(it.x1 - 1, cz);
  }

  // The planted floor: a green court between the cages, in the floor plane, so
  // it costs the room nothing to walk on.
  c.n += floorPaint(ctx, it, (x, z) =>
    (x + z) % 4 === 0 ? "moss_block" : (x + z) % 4 === 2 ? "grass_block" : null,
  );

  // The keeper's kit, at the near end — the far end is the cages' now.
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, nearZ, "composter", { level: "0" });
  c.put1(it.x1, nearZ, pottedAt(it.x1, nearZ));
}

/**
 * `botanical_garden` — the glass pavilion grown up.
 *
 * The pavilion's glazing rule verbatim: no glass on a **floor plane** and none
 * on the torch course, because a torch names the block behind it and glass is
 * not a face the physics lint accepts for a bracket. Over that, three things
 * the pavilion has not got:
 *
 * - **raised planters**, laid in rows through {@link bankCells} so the field
 *   keeps its three-column aisle and its clear lane — a moss block with a
 *   potted specimen standing on it where the storey has the headroom;
 * - **path discipline**: the aisle is written into the floor plane as gravel,
 *   so the route reads as a path rather than as a gap in the planting;
 * - **a pond, only if the predicate holds**. The pond is written into the floor
 *   plane at `y = 0`, inset **two** cells from the interior on every side, and
 *   rimmed on all four sides with a coping course, so every water cell has the
 *   foundation under it and solid floor beside it. On any envelope where that
 *   inset does not leave a rect, there is no pond at all.
 */
function fitBotanicalGarden(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const plan = wallPlan(ctx);
  const torchY = Math.min(3, ctx.storyHeight - 1);

  if (plan !== null) {
    const band: number[] = [];
    for (let y = 2; y < ctx.wallTop; y++) {
      if (y === torchY) continue;
      if (y % ctx.storyHeight === 0) continue;
      band.push(y);
    }
    if (band.length > 1 && band[0] === 2) band.shift();
    for (const cell of ringOf(plan.sx, plan.sz)) {
      const corner =
        (cell.x === 0 || cell.x === plan.sx - 1) && (cell.z === 0 || cell.z === plan.sz - 1);
      if (corner) continue;
      for (const y of band) {
        if (clad(ctx, cell.x, y, cell.z, "glass")) c.n++;
      }
    }
  }

  // The path: the aisle column and the lane round the field, in gravel.
  c.n += floorPaint(ctx, it, (x, z) =>
    Math.abs(x - lamp.x) <= 1 || x === it.x0 || x === it.x1 || z === it.z0 || z === it.z1
      ? "gravel"
      : null,
  );

  // THE POND, or nothing. Inset two on every side, so the walkway round it is
  // two cells wide and every water cell is rimmed by construction.
  const pond: LocalRect = { x0: it.x0 + 2, z0: it.z0 + 2, x1: it.x1 - 2, z1: it.z1 - 2 };
  const roomy = pond.x1 - pond.x0 >= 1 && pond.z1 - pond.z0 >= 1;
  // The pond may never swallow the lantern column or the aisle: keep it to the
  // half of the room the far end is in, one clear cell short of the middle.
  const pz0 = end.look === "north" ? pond.z0 : Math.max(pond.z0, lamp.z + 2);
  const pz1 = end.look === "north" ? Math.min(pond.z1, lamp.z - 2) : pond.z1;
  const px0 = Math.max(pond.x0, lamp.x + 2);
  const px1 = pond.x1;
  const holds = roomy && pz1 >= pz0 && px1 >= px0;
  if (holds) {
    for (let z = pz0; z <= pz1; z++) {
      for (let x = px0; x <= px1; x++) ctx.put(x, 0, z, "water", { level: "0" });
    }
    c.n += (pz1 - pz0 + 1) * (px1 - px0 + 1);
    // The coping: every cell touching the water, written solid in the floor
    // plane. This is the rim the fluid rule wants.
    for (let z = pz0 - 1; z <= pz1 + 1; z++) {
      for (let x = px0 - 1; x <= px1 + 1; x++) {
        if (x >= px0 && x <= px1 && z >= pz0 && z <= pz1) continue;
        if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
        ctx.put(x, 0, z, "stone_bricks");
        c.n++;
      }
    }
  }

  // The planters, in the bank's rows, on the dry side of the room.
  const wet = (x: number, z: number): boolean =>
    holds && x >= px0 - 1 && x <= px1 + 1 && z >= pz0 - 1 && z <= pz1 + 1;
  for (const cell of bankCells(ctx, end, 2)) {
    if (wet(cell.x, cell.z)) continue;
    if (!c.put1(cell.x, cell.z, "moss_block")) continue;
    if (ctx.storyHeight >= 4) c.stack(cell.x, cell.z, 2, pottedAt(cell.x, cell.z));
  }

  // The gardener's corner.
  c.put1(it.x0, end.z, "composter", { level: "0" });
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });
}

/**
 * `seed_vault` — the bunker, civil.
 *
 * Not a military bunker and not a cellar: a **repository**, which is a very
 * plain room whose whole read is that it is built to last and kept cold.
 *
 * - the **door face** is trimmed in iron: the wall ring around the doorway,
 *   two cells either side, re-clad in iron blocks, so the way in reads as a
 *   vault door rather than as a cottage's;
 * - the **frost trim** is a band of packed ice and blue ice at the plate line
 *   right round the building;
 * - the **shelf rows** are barrels down both side walls with labelled banners
 *   over them — banners, never signs;
 * - the **backup lanterns** stand at the head of the barrel columns, which the
 *   stack guard refuses on a three-course storey and grants on a taller one.
 *   That refusal is correct: two blocks in a three-high column is a pillar.
 */
function fitSeedVault(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const plan = wallPlan(ctx);

  if (plan !== null) {
    // The frost band, at the plate line.
    const bandY = Math.max(2, ctx.wallTop - 1);
    for (const cell of ringOf(plan.sx, plan.sz)) {
      const block = (cell.x + cell.z) % 4 === 0 ? "blue_ice" : "packed_ice";
      for (let y = bandY; y <= ctx.wallTop; y++) {
        if (clad(ctx, cell.x, y, cell.z, block)) c.n++;
      }
    }
    // The iron door face.
    if (ctx.door !== null) {
      const along = ctx.door.face === "north" || ctx.door.face === "south" ? "x" : "z";
      for (let d = -2; d <= 2; d++) {
        const x = along === "x" ? ctx.door.x + d : ctx.door.x;
        const z = along === "z" ? ctx.door.z + d : ctx.door.z;
        if (x < 0 || x >= plan.sx || z < 0 || z >= plan.sz) continue;
        for (let y = 1; y <= Math.min(ctx.wallTop - 1, 4); y++) {
          if (clad(ctx, x, y, z, d === 0 ? "iron_block" : "chiseled_stone_bricks")) c.n++;
        }
      }
    }
  }

  // The shelf rows and the labels over them.
  const labelY = Math.min(2, ctx.storyHeight - 1);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    for (const x of [it.x0, it.x1]) {
      if (!c.put1(x, z, "barrel", { facing: "up", open: "false" })) continue;
      if ((z - it.z0) % 3 === 0) {
        c.stack(x, z, labelY, x === it.x0 ? "white_wall_banner" : "light_blue_wall_banner", {
          facing: x === it.x0 ? "east" : "west",
        });
      } else if ((z - it.z0) % 3 === 1) {
        // The backup light, at the head of the column. Granted on a tall
        // storey, refused on a short one, and correct either way.
        c.stack(x, z, ctx.storyHeight - 1, ctx.style["light.lantern"] as string, {
          hanging: "true",
          waterlogged: "false",
        });
      }
    }
  }

  // The register and the cold store, at the two ends.
  c.put1(it.x0, end.z, "chest", { facing: end.look === "north" ? "south" : "north", type: "single" });
  c.put1(it.x1, end.z, "blue_ice");
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "composter", { level: "0" });
}

/**
 * `weather_station` — instruments outside, readings inside.
 *
 * The instruments are the building, and both of them stand on **real support**:
 *
 * - the **lightning rod** goes on the roof, on a solid mast raised from the
 *   deck the flat-roof rebuild lays, so there is masonry all the way down;
 * - the **windsock** is a banner on a grounded apron pole — {@link apronPost}
 *   fills `y = 0` when the apron cell has nothing under it, which is the stilt
 *   lesson, and the pole is never put on the doorstep.
 *
 * Inside: a chart desk with a lectern, and a **barometer wall** — buttons and
 * levers on the interior face of a solid wall, which is the one place the lint
 * accepts them.
 */
function fitWeatherStation(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const plan = roofPlan(ctx);

  if (plan !== null) {
    clearRoof(ctx, plan);
    const deck = ctx.style["roof.solid"] as string;
    c.n += terrace(ctx, plan, deck, (x, z) => ({
      block: ctx.style["stone.wall"] as string,
      height: (x + z) % 2 === 0 ? 1 : 0,
    }));
    // The mast: solid to the top, then the rod standing on it.
    const mx = plan.sx >> 1;
    const mz = plan.sz >> 1;
    let y = plan.base + 1;
    for (; y <= plan.top - 1; y++) {
      ctx.put(mx, y, mz, deck);
      c.n++;
    }
    ctx.put(mx, y, mz, "lightning_rod", { facing: "up", powered: "false" });
    c.n++;
  }

  // The windsock: a grounded pole in the apron, with a banner on it, never on
  // the doorstep.
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const out = outsideDoor(ctx);
  const pole = apronOf(sx, sz).find(
    (cell) =>
      cell.x === -1 &&
      cell.z === Math.floor(sz / 2) &&
      !(out !== null && out.x === cell.x && out.z === cell.z),
  );
  if (pole !== undefined) {
    const fence = ctx.style["wall.fence"] as string;
    apronPost(ctx, c, pole.x, pole.z, fence, 3);
    c.raw(pole.x, 4, pole.z, "orange_banner", { rotation: "0" });
  }

  // The chart desk.
  c.put1(it.x0, end.z, "cartography_table");
  c.put1(it.x1, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });

  // The barometer wall: dials on the interior face of the far wall, which is
  // solid, and never on a glazed cell — `blockAt` says which is which.
  const wallZ = end.look === "north" ? it.z0 - 1 : it.z1 + 1;
  const face: Cardinal = end.look === "north" ? "south" : "north";
  for (let x = it.x0; x <= it.x1; x++) {
    const behind = ctx.blockAt(x, 2, wallZ);
    if (behind === undefined || /glass|_pane$|_door$/.test(behind.block)) continue;
    const dial = (x + wallZ) % 3 === 0 ? "lever" : "stone_button";
    // In the interior cell BESIDE the wall, hanging on it — not in the wall
    // plane itself. The old `wallZ + 0` was a typo'd `+ 1`: it wrote the dial
    // into the wall's own cell, deleting a wall block and leaving the button
    // backed by exterior air (would pop in vanilla; found 2026-08-13 by the
    // decay-orphan census, in intact builds).
    ctx.put(x, 2, wallZ === it.z0 - 1 ? wallZ + 1 : wallZ - 1, dial, {
      face: "wall",
      facing: face,
      powered: "false",
    });
    c.n++;
  }

  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "bookshelf");
}

/**
 * `field_station` — the hut, scientific.
 *
 * A remote outpost: somebody sleeps here and takes readings. Four things and
 * nothing else, because a field station that is furnished like a house is a
 * house. The **bunk** goes through `placeBed`, which lays both halves or
 * neither. The **sample shelves** are barrels down one wall. The **radio** is an
 * observer with a lever on it — the one honest way to read "instrument that
 * listens" out of the block table — standing on a solid bench. The **map table**
 * is a cartography table with a chart shelf beside it.
 */
function fitFieldStation(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const bedFacing: Cardinal = end.look === "north" ? "south" : "north";

  // The bunk, in the near corner, laid away from the far wall.
  ctx.placeBed(it.x0, nearZ, bedFacing, "light_gray_bed");

  // The sample shelves, down the east wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    c.put1(it.x1, z, (z - it.z0) % 4 === 0 ? "bookshelf" : "barrel", {
      ...((z - it.z0) % 4 === 0 ? {} : { facing: "up", open: "false" }),
    });
  }

  // The radio: an observer on the west wall with the set's switch on top of
  // it. On the wall rather than at the far end, because the far end is the
  // desk run's and a second thing pinned there is a thing that never lands.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (!c.put1(it.x0, z, "observer", { facing: "east", powered: "false" })) continue;
    c.stack(it.x0, z, 2, "lever", { face: "floor", facing: bedFacing, powered: "false" });
    break;
  }

  // The map table and the charts, laid left to right along the far wall rather
  // than pinned to a corner: the ground floor's reserve refuses whichever cells
  // it refuses, and a desk pinned to one cell is a desk some envelopes never
  // get. The telescope dome's lesson, applied here.
  let desk = 0;
  for (let x = it.x0; x <= it.x1 && desk < 2; x++) {
    const landed =
      desk === 0
        ? c.put1(x, end.z, "cartography_table")
        : c.put1(x, end.z, "lectern", { facing: bedFacing, has_book: "false", powered: "false" });
    if (landed) desk++;
  }
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });

  // The floor: a working plane, boarded and grubby.
  c.n += floorPaint(ctx, it, (x, z) => ((x + z) % 5 === 0 ? "coarse_dirt" : null));
}

/* -------------------------------------------------------------------------- */
/* modern                                                                      */
/* -------------------------------------------------------------------------- */

/** The lowest course a modern glass band may start at: never the floor plane. */
const BAND_SILL_Y = 2;

/**
 * The glass band: a run of glazing round the wall ring, above the plinth.
 *
 * Shared by all three modern archetypes because it is the same building move.
 * The corners are left in masonry — a glass corner reads as a mistake, and it
 * is also the one place the shell's own frame wants something opaque — and the
 * torch course and every floor plane are skipped, which is the greenhouse's
 * sill rule and the reason the physics lint accepts the brackets.
 */
function glassBand(ctx: FitOutContext, plan: RebuildPlan, glass: string, height: number): number {
  const torchY = Math.min(3, ctx.storyHeight - 1);
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    const corner =
      (cell.x === 0 || cell.x === plan.sx - 1) && (cell.z === 0 || cell.z === plan.sz - 1);
    if (corner) continue;
    for (let y = BAND_SILL_Y; y < BAND_SILL_Y + height && y < ctx.wallTop; y++) {
      if (y === torchY) continue;
      if (y % ctx.storyHeight === 0) continue;
      if (clad(ctx, cell.x, y, cell.z, glass)) n++;
    }
  }
  return n;
}

/**
 * `penthouse` — the top-floor flat, read at house scale.
 *
 * A penthouse is not a tall building; a tall building is the high-rise
 * grammar's job. It is the **apartment at the top**, and everything that makes
 * one is a surface: a **roof terrace** with a low parapet and planters standing
 * on the deck; a **wide glass band** round the living side; a **luxury open
 * plan** inside — a rug in the floor plane, a seating group turned in on a low
 * table against one wall, and the middle of the floor left empty, because
 * space is the luxury.
 */
function fitPenthouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  // The **wall** plan, not the roof one. A flat-roofed building's shell leaves
  // one course above the plate, and `roofPlan` refuses that — which would mean
  // the one archetype whose whole read is its roof terrace never got one.
  const plan = wallPlan(ctx);

  if (plan !== null) {
    clearRoof(ctx, plan);
    // The terrace: a solid deck, a low parapet, and planters standing on it in
    // the gaps the parapet leaves. The planters go **in** the parapet course
    // rather than on top of it, because a flat roof leaves exactly one course
    // of room above the deck and a pot two courses up is a pot outside the
    // envelope.
    c.n += terrace(ctx, plan, "smooth_quartz", (x, z) => ({
      block: "quartz_slab",
      height: (x + z) % 6 === 0 ? 0 : 1,
    }));
    for (const cell of ringOf(plan.sx, plan.sz)) {
      if ((cell.x + cell.z) % 6 !== 0) continue;
      const y = plan.base + 1;
      if (y > plan.top) continue;
      ctx.put(cell.x, y, cell.z, pottedAt(cell.x, cell.z));
      c.n++;
    }
  }
  const wallOnly = wallPlan(ctx);
  if (wallOnly !== null) {
    c.n += glassBand(ctx, wallOnly, "glass", 3);
  }

  // The rug: the whole living half of the floor, painted rather than laid.
  c.n += floorPaint(ctx, it, (x, z) =>
    (x + z) % 2 === 0 ? "white_concrete" : "light_gray_concrete",
  );

  // The seating group, on one wall only, so the floor stays open.
  const seat = ctx.style["stair.interior"] as string;
  if (benchHeadroom(ctx)) {
    for (let z = it.z0 + 2; z <= it.z1 - 2; z++) {
      c.put1(it.x0, z, seat, { facing: "west", half: "bottom", shape: "straight" });
    }
  }
  const tx = it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0;
  table(ctx, c, tx, Math.floor((it.z0 + it.z1) / 2) + 1 <= it.z1 - 1
    ? Math.floor((it.z0 + it.z1) / 2) + 1
    : Math.floor((it.z0 + it.z1) / 2));

  // The dresser wall and the planting.
  c.put1(it.x1, end.z, "bookshelf");
  c.put1(it.x1, nearZ, pottedAt(it.x1, nearZ));
  c.put1(it.x0, end.z, pottedAt(it.x0, end.z));
}

/**
 * `atrium_block` — a light-well with a building round it.
 *
 * The atrium is the void, and the void is drawn three ways at once, all of them
 * in surfaces rather than in props, because a court a body cannot cross is not
 * a court:
 *
 * - the **court floor** is polished stone in the floor plane, inset from the
 *   walls, so the middle of the room reads as a different place;
 * - the **gallery** is the ring around it, in a second stone, with planters at
 *   its four corners and nothing at all on its lanes;
 * - the **roof light** is a glazed band over the court, laid on the flat deck
 *   the rebuild lays, with masonry all round it holding it up. The glazing is
 *   inset two cells from the deck edge on every side, so nothing partial ever
 *   ends up over the eave.
 */
function fitAtriumBlock(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  // The wall plan: a flat roof leaves one course over the plate, which is all
  // a deck and a low parapet need, and `roofPlan` would refuse it.
  const plan = wallPlan(ctx);
  const lamp = lanternColumn(it);

  if (plan !== null) {
    clearRoof(ctx, plan);
    const deck = ctx.style["roof.solid"] as string;
    c.n += terrace(ctx, plan, deck, () => ({ block: ctx.style["stone.wall"] as string, height: 1 }));
    // The roof light, over the court and nowhere near the eave.
    const gx0 = 2;
    const gx1 = plan.sx - 3;
    const gz0 = 2;
    const gz1 = plan.sz - 3;
    if (gx1 >= gx0 && gz1 >= gz0) {
      slabRect(ctx, plan.base, gx0, gx1, gz0, gz1, "glass");
      c.n += (gx1 - gx0 + 1) * (gz1 - gz0 + 1);
    }
  }
  const wallOnly = wallPlan(ctx);
  if (wallOnly !== null) c.n += glassBand(ctx, wallOnly, "glass", 2);

  // The court and the gallery, both in the floor plane.
  c.n += floorPaint(ctx, it, (x, z) => {
    const d = ringDistance(x, z, lamp.x, lamp.z);
    if (d <= 2) return "polished_andesite";
    if (d === 3) return "polished_diorite";
    return null;
  });

  // The gallery planting: the four corners of the court ring, off the lanes.
  for (const [dx, dz] of [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ] as const) {
    const x = lamp.x + dx;
    const z = lamp.z + dz;
    if (x <= it.x0 || x >= it.x1 || z <= it.z0 || z >= it.z1) continue;
    c.put1(x, z, pottedAt(x, z));
  }

  // The reception, at the far end.
  c.put1(it.x0, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  c.put1(it.x1, end.z, "bookshelf");
}

/**
 * `modern_villa` — flat-roofed, white, and mostly window.
 *
 * Deliberately not the Mediterranean villa (wave two), which keeps bare
 * `villa`: this one is the twentieth-century house, and the difference is
 * stated in four moves.
 *
 * - **white re-clad**: the wall ring above the plinth in white concrete, with a
 *   band of the smooth grey the parapet is made of;
 * - **wide glass**: a four-course band, corners excepted;
 * - **a floating stair, read against a wall**. It is a *read*, not a cantilever
 *   — the treads are stairs standing on the floor along the wall, each with the
 *   wall behind it, so there is real support under and behind every one. A
 *   genuinely floating tread is a block with nothing holding it up, which the
 *   lint refuses and a builder should too;
 * - **sparse furniture**: one seating pair, one table, one planter. A
 *   minimalist house furnished like a cottage is a cottage.
 */
function fitModernVilla(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  // The wall plan, for the flat-roof reason the penthouse states.
  const plan = wallPlan(ctx);

  if (plan !== null) {
    clearRoof(ctx, plan);
    c.n += terrace(ctx, plan, "white_concrete", (x, z) => ({
      block: (x + z) % 3 === 0 ? "smooth_stone_slab" : "smooth_stone",
      height: 1,
    }));
  }
  const wallOnly = wallPlan(ctx);
  if (wallOnly !== null) {
    c.n += reclad(ctx, wallOnly, 1, ctx.wallTop, (x, y, z) =>
      y === ctx.wallTop ? "smooth_stone" : (x + y + z) % 13 === 0 ? "light_gray_concrete" : "white_concrete",
    );
    c.n += glassBand(ctx, wallOnly, "glass", 4);
  }

  // The floating stair: a flight against the west wall, every tread standing
  // on the floor with the wall at its back.
  const treads = ctx.style["stair.interior"] as string;
  const dir = end.look === "north" ? 1 : -1;
  for (let k = 0; k < 3; k++) {
    const z = end.z + dir * (1 + k);
    if (z < it.z0 || z > it.z1) break;
    if (!c.put1(it.x0, z, treads, { facing: "east", half: "bottom", shape: "straight" })) continue;
    // The riser behind it: the wall face, in the pale stone, so the flight
    // reads as one object rather than as three loose steps.
    if (ctx.blockAt(it.x0 - 1, 2, z) !== undefined) {
      clad(ctx, it.x0 - 1, 2, z, "smooth_stone");
      c.n++;
    }
  }

  // The floor: one plane, pale, with the grain of a poured slab.
  c.n += floorPaint(ctx, it, (x, z) =>
    (x * 3 + z) % 7 === 0 ? "light_gray_concrete" : "white_concrete",
  );

  // The furniture, and there is very little of it.
  if (benchHeadroom(ctx)) {
    c.put1(it.x1, nearZ - dir, treads, { facing: "east", half: "bottom", shape: "straight" });
    c.put1(it.x1, nearZ, treads, { facing: "east", half: "bottom", shape: "straight" });
  }
  table(ctx, c, it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, nearZ);
  c.put1(it.x0, nearZ, pottedAt(it.x0, nearZ));
  c.put1(it.x1, end.z, "bookshelf");
}
