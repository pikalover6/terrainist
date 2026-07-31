/**
 * Archetype breadth, **wave three C** — the regional houses.
 *
 * Twelve dwellings from twelve building traditions: a hanok, a machiya, a
 * riad, a cycladic house, an adobe pueblo, a stilt house, a sod house, an
 * igloo, a thatched roundhouse, a colonial veranda house, a hacienda and a
 * fachwerk barn.
 *
 * ## An archetype is a fit-out, not a second grammar
 *
 * The normative statement is the header of `archetypes-blitz.ts`; the short
 * form is the one `archetypes-wave2.ts` restates. A fit-out runs **after**
 * every shape stage and writes into the same cell map, so it may re-clad a
 * wall field and rebuild a roof without a line of `core.ts` changing, and
 * every invariant the shell already guarantees still holds. An igloo is the
 * house shell under a corbelled snow dome; a hanok is the same shell with
 * dark post-and-beam bands on white walls under a tiered dark roof. Neither
 * is a new grammar, and neither may grow one: no new footprint, no new
 * opening rule, no second storey system.
 *
 * ## The two rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} and in plan by the footprint plus
 *    the one-block apron ring the eave already uses.
 * 2. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take`.
 *
 * ## The field lessons this file was written against
 *
 * Every one of these came back from an in-game walkthrough or a physics-lint
 * failure, and each is a rule here rather than a comment:
 *
 * - a **stair's `facing` is its backrest** — it points away from whatever the
 *   sitter is looking at;
 * - a bare `flower_pot` renders **empty**; every pot goes through
 *   {@link pottedAt}, which picks a `potted_*` from position;
 * - the shell hangs a lantern over the **middle column** of the room at head
 *   height. No route here is one cell wide through that column — which is why
 *   the roundhouse leaves its centre open rather than furnishing it, and why
 *   the riad's basin is a *floor* feature rather than a plinth;
 * - the trestle table is refused by the stack guard under a three-course
 *   storey, so {@link table} switches to a top slab there;
 * - nothing body-blocking stands on a width-1 circulation ring; every prop in
 *   this file is on a wall row;
 * - **no sign blocks.** A sign needs a paired block entity the op stream
 *   cannot carry; a banner is the signage idiom;
 * - **fluids are boxed in by construction.** The riad's basin is written into
 *   the floor plane at `y = 0`, inset at least one cell from the interior, so
 *   under every water cell is the foundation skirt and beside it is either
 *   more basin or a floor cell the shell already made solid. That is the
 *   bathhouse argument verbatim (see `archetypes-town.ts`), and it is why the
 *   **stilt house gets no water at all**: it reads as a raised floor — posts
 *   in the apron ring and a porch trim — while standing on ordinary ground.
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
 * The twelve archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`.
 */
export const REGIONAL_BUILDING_ARCHETYPES = [
  "hanok",
  "machiya",
  "riad",
  "cycladic_house",
  "adobe_pueblo",
  "stilt_house",
  "sod_house",
  "igloo",
  "thatched_roundhouse",
  "colonial_veranda_house",
  "hacienda",
  "fachwerk_barn",
] as const;

/** One of the archetypes this file fits out. */
export type RegionalBuildingArchetype = (typeof REGIONAL_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isRegionalArchetype(value: string): value is RegionalBuildingArchetype {
  return (REGIONAL_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after wave two and *before* the extended table. Every tag below is
 * one no earlier table claims, and the near misses are deliberate:
 *
 * - `barn`, `stable` and `byre` belong to the **extended barn**. A fachwerk
 *   barn answers to `fachwerk` and its own id only — claiming bare `barn`
 *   would silently retheme every barn in the vocabulary;
 * - `house` belongs to the original table, where it falls through to a
 *   cottage; nothing here claims it;
 * - `villa`, `chalet`, `alpine`, `saltbox`, `dutch_gable`, `canal_house`,
 *   `stepped_gable`, `trullo`, `tudor_row` and `half_timber` all belong to
 *   earlier vernacular waves;
 * - bare `roundhouse` is an unimplemented catalog id — an *engine* roundhouse,
 *   which is a locomotive shed and not a hut — so the thatched roundhouse
 *   takes `thatched_roundhouse` and `wattle` instead.
 */
export function regionalArchetypeOfTags(
  tags: readonly string[],
): RegionalBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("hanok")) return "hanok";
  if (has("machiya")) return "machiya";
  if (has("riad")) return "riad";
  if (has("cycladic_house") || has("cycladic") || has("whitewash")) return "cycladic_house";
  if (has("adobe_pueblo") || has("adobe") || has("pueblo")) return "adobe_pueblo";
  if (has("stilt_house") || has("stilts")) return "stilt_house";
  if (has("sod_house") || has("sod") || has("turf")) return "sod_house";
  if (has("igloo")) return "igloo";
  if (has("thatched_roundhouse") || has("wattle")) return "thatched_roundhouse";
  if (has("colonial_veranda_house") || has("veranda") || has("colonial")) {
    return "colonial_veranda_house";
  }
  if (has("hacienda")) return "hacienda";
  if (has("fachwerk_barn") || has("fachwerk")) return "fachwerk_barn";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one.
 */
export function regionalFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // The tiered roof wants the tallest shape under it to rebuild from.
    case "hanok":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    // A narrow frontage of lattice: dense small lights behind the screens.
    case "machiya":
      return { windowShape: "single", windowRhythm: "dense", roof: "gable" };
    // Plain outside: a riad turns its back on the street.
    case "riad":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // Flat and blind-ish, whitewashed: the parapet takes the roof over.
    case "cycladic_house":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "adobe_pueblo":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "stilt_house":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    case "sod_house":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // The dome needs vertical room and the walls are almost blind.
    case "igloo":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "thatched_roundhouse":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // Tall shuttered lights over a veranda.
    case "colonial_veranda_house":
      return { windowShape: "tall", windowRhythm: "regular", roof: "hip" };
    case "hacienda":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    // A barn is its door face and its big gable.
    case "fachwerk_barn":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
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
 * Wave two's `Wave2Plan` in every respect, restated here rather than imported
 * because the two waves are separate seams and a shared private helper is a
 * shared edit. The refusals are the same: a **plain rect** only, and at least
 * two courses of room above the eave plate before a roof may be rebuilt.
 */
interface RegionalPlan {
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
function wallPlan(ctx: FitOutContext): RegionalPlan | null {
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
function roofPlan(ctx: FitOutContext): RegionalPlan | null {
  const plan = wallPlan(ctx);
  if (plan === null) return null;
  return plan.top - plan.base < 2 ? null : plan;
}

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: RegionalPlan): void {
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

/**
 * The cell a player stands in to open the door, or `null` when there is none.
 *
 * The one apron cell nothing in this file may ever fill. The physics lint
 * walks a building **from its door**; a hitching post or a snow porch written
 * over the doorstep is a building with no way in.
 */
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
 * Wave two's list unchanged: the way in, the way up, the fire, the glass and
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
  plan: RegionalPlan,
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
 * Corbel a cone or a dome over the envelope, closing on a cap.
 *
 * The trullo's machinery, generalised by one parameter: `courses` is how many
 * courses are laid before the ring steps in, so a value of 1 gives a steep
 * cone (the roundhouse's thatch, the igloo's dome read at small sizes) and 2 a
 * shallower, tiered one (the hanok's giwa). The first course is solid — it is
 * the lid of the room below — and the last is capped, so the cone finishes on
 * a face rather than on a hole.
 */
function corbel(
  ctx: FitOutContext,
  plan: RegionalPlan,
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
  // The cap slab must be a solid block: a partial one (a fence, a slab) in
  // the middle of the rect has nothing under it but the cone's hollow, and
  // the lint's support-chain rule rightly calls it floating. The one place a
  // partial block belongs is the finial — a single spike standing on the
  // solid cap.
  slab(ctx, capY, rect.x0, rect.x1, rect.z0, rect.z1, cap);
  if (capY + 1 <= plan.top) {
    ctx.put((rect.x0 + rect.x1) >> 1, capY + 1, (rect.z0 + rect.z1) >> 1, finial ?? cap);
    n++;
  }
  return n;
}

/**
 * A flat roof: a deck at the course above the ceiling plane and a parapet.
 *
 * `height` gives the parapet's height at a perimeter cell, which is what makes
 * an adobe roofline **stepped** and a cycladic one level. Everything stays
 * inside the footprint and under `top`.
 */
function terrace(
  ctx: FitOutContext,
  plan: RegionalPlan,
  deck: string,
  parapet: (x: number, z: number) => { readonly block: string; readonly height: number },
): number {
  let n = 0;
  slab(ctx, plan.base, 0, plan.sx - 1, 0, plan.sz - 1, deck);
  n += plan.sx * plan.sz;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    const wall = parapet(cell.x, cell.z);
    for (let h = 1; h <= wall.height; h++) {
      const y = plan.base + h;
      if (y > plan.top) break;
      ctx.put(cell.x, y, cell.z, wall.block);
      n++;
    }
  }
  return n;
}

/* -------------------------------------------------------------------------- */
/* interior primitives                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One table cell, by the idiom the storey has headroom for.
 *
 * Wave two's rule verbatim: the trestle — a fence stem under a pressure plate
 * — is two blocks in one column and is refused by the stack guard under a
 * three-course storey, so a top slab stands in for it there.
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

/** Lay one bed wherever the room will take it, head against a wall. */
function bedAlcove(ctx: FitOutContext, block: string): boolean {
  const it = ctx.interior;
  const ranges: readonly { readonly x: number; readonly wall: number; readonly facing: Cardinal }[] = [
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

/** Trapdoor props for a screen or shutter hung flat against a wall. */
function shutter(facing: Cardinal): Record<string, string> {
  return {
    facing,
    half: "top",
    open: "false",
    powered: "false",
    waterlogged: "false",
  };
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
export function furnishRegional(ctx: FitOutContext): number {
  if (!isRegionalArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "hanok":
      fitHanok(ctx, c);
      break;
    case "machiya":
      fitMachiya(ctx, c);
      break;
    case "riad":
      fitRiad(ctx, c);
      break;
    case "cycladic_house":
      fitCycladicHouse(ctx, c);
      break;
    case "adobe_pueblo":
      fitAdobePueblo(ctx, c);
      break;
    case "stilt_house":
      fitStiltHouse(ctx, c);
      break;
    case "sod_house":
      fitSodHouse(ctx, c);
      break;
    case "igloo":
      fitIgloo(ctx, c);
      break;
    case "thatched_roundhouse":
      fitThatchedRoundhouse(ctx, c);
      break;
    case "colonial_veranda_house":
      fitColonialVerandaHouse(ctx, c);
      break;
    case "hacienda":
      fitHacienda(ctx, c);
      break;
    case "fachwerk_barn":
    default:
      fitFachwerkBarn(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* east asia                                                                   */
/* -------------------------------------------------------------------------- */

/** The dark timber of a hanok's post-and-beam frame. */
const HANOK_FRAME = "dark_oak_log";
/** The lime-plaster infill between the posts. */
const HANOK_INFILL = "white_terracotta";
/** The giwa — the dark tile of the roof. */
const HANOK_TILE = "deepslate_tiles";

/**
 * `hanok` — post-and-beam bands on white walls under a tiered dark roof.
 *
 * The wall field becomes white plaster with a **dark post in every third
 * column** and a beam band at the plinth head and under the plate: a hanok is
 * read from its frame, not from its infill. The roof is rebuilt as a
 * **two-course-per-inset corbel** in deepslate tile, which rises shallower
 * than a trullo's cone and so reads as the long low giwa pitch, with a course
 * of stairs in the apron at the eave for the upturned edge the roof is famous
 * for.
 *
 * The interior is an ondol room: low tables and carpet, everything on a wall
 * row. No fire — the shell owns hearths, and a second one is a fire in a
 * corridor.
 */
function fitHanok(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(
      ctx,
      plan,
      2,
      ctx.wallTop - 1,
      (x, y, z) => {
        if (y === 2 || y === ctx.wallTop - 1) return HANOK_FRAME;
        const along = x === 0 || x === plan.sx - 1 ? z : x;
        return along % 3 === 0 ? HANOK_FRAME : HANOK_INFILL;
      },
      (x, y, z) => {
        if (y === 2 || y === ctx.wallTop - 1) {
          return { axis: x === 0 || x === plan.sx - 1 ? "z" : "x" };
        }
        const along = x === 0 || x === plan.sx - 1 ? z : x;
        return along % 3 === 0 ? { axis: "y" } : undefined;
      },
    );
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += corbel(ctx, roof, () => HANOK_TILE, "chiseled_deepslate", 2);
    // The upturned eave: a course of stairs in the apron at the lowest roof
    // course, sloping away from the building. It is the whole curve a block
    // grammar can honestly draw, and it lives in the ring the eave already had.
    for (const cell of apronOf(roof.sx, roof.sz)) {
      const facing: Cardinal =
        cell.z === -1 ? "north" : cell.z === roof.sz ? "south" : cell.x === -1 ? "west" : "east";
      ctx.put(cell.x, roof.base, cell.z, "deepslate_tile_stairs", {
        facing,
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      });
      c.n++;
    }
  }

  const it = ctx.interior;
  // The ondol floor: low tables against the walls, a chest of bedding, a mat.
  table(ctx, c, it.x0, it.z0 + 1 <= it.z1 ? it.z0 + 1 : it.z0);
  table(ctx, c, it.x1, it.z1 - 1 >= it.z0 ? it.z1 - 1 : it.z1);
  c.put1(it.x1, it.z0, "chest", { facing: "west", type: "single" });
  c.put1(it.x0, it.z1, "white_carpet");
  c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, it.z1, pottedAt(it.x0, it.z1));
}

/**
 * `machiya` — a lattice frontage, a shop front and a living room behind it.
 *
 * The signature is the **koshi**: a screen of trapdoors hung flat over the
 * street facade, which on this grammar is the wall the door is in. Behind it
 * the wall field is stripped spruce over a dark plinth band. Inside, the
 * building is read front to back — a counter of frames and a barrel at the
 * door end (the *mise no ma*, the shop), a table and a chest at the far end
 * (the living room) — with the middle of the floor left as the through-passage
 * a deep, narrow townhouse is entirely about.
 */
function fitMachiya(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) =>
      y === 2 || y === ctx.wallTop ? "dark_oak_log" : "stripped_spruce_log",
    );
    // The koshi screen: trapdoors in the apron over the street face, clear of
    // the doorstep and clear of the door's own head. A screen across the way in
    // is a shop nobody can enter.
    const face = ctx.door?.face ?? "south";
    const [dx, dz] = cardinalStep(face);
    for (const cell of apronOf(plan.sx, plan.sz)) {
      const onFace =
        (dz === -1 && cell.z === -1) ||
        (dz === 1 && cell.z === plan.sz) ||
        (dx === -1 && cell.x === -1) ||
        (dx === 1 && cell.x === plan.sx);
      if (!onFace) continue;
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      for (let y = 2; y <= Math.min(ctx.wallTop - 1, ctx.storyHeight); y++) {
        ctx.put(cell.x, y, cell.z, ctx.style["wall.trapdoor"] as string, shutter(opposite(face)));
        c.n++;
      }
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const frame = ctx.style["wall.frame"] as string;
  // The shop counter, along the near wall's edge rather than across the room.
  for (const x of [it.x0, it.x1]) c.put1(x, nearZ, frame, { axis: "x" });
  c.put1(it.x0, nearZ === it.z0 ? nearZ + 1 : nearZ - 1, "barrel", { facing: "up", open: "false" });
  // The living room, at the far end.
  table(ctx, c, it.x1, end.z);
  c.put1(it.x0, end.z, "chest", { facing: "east", type: "single" });
  c.put1(it.x1, end.z === it.z0 ? end.z + 1 : end.z - 1, pottedAt(it.x1, end.z));
}

/* -------------------------------------------------------------------------- */
/* the mediterranean and the maghreb                                           */
/* -------------------------------------------------------------------------- */

/**
 * `riad` — plain outside, rich inside, around a basin.
 *
 * The exterior is deliberately dull: a flat field of sandstone with no
 * ornament at all, because a riad shows the street a wall. Everything is spent
 * inside — a **basin** written into the floor plane, a patterned surround of
 * carpet, lattice trim under the plate and potted plants at the corners.
 *
 * ### The basin is the pool predicate
 *
 * The water goes **into the floor** at `y = 0`, in a rect inset at least one
 * cell from the interior on every side, and the ring of floor cells touching
 * it is written solid. So under every water cell is the foundation skirt the
 * shell lays under the whole footprint, and beside every water cell is either
 * more basin or solid floor. That is the bathhouse argument, unchanged, and it
 * holds for every riad this grammar will ever build. Nothing is ever placed on
 * a water cell.
 */
function fitRiad(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) =>
      (x * 5 + y * 3 + z * 7) % 8 === 0 ? "cut_sandstone" : "sandstone",
    );
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  // The basin: a 2x2 at the middle of the room, inset one cell from the
  // interior on every side. Refused outright on a room too small to hold it
  // with a walkway round it — a courtyard you have to wade to cross is a pond.
  const wide = it.x1 - it.x0 >= 4 && it.z1 - it.z0 >= 4;
  const basin = wide
    ? { x0: lamp.x - 1, x1: lamp.x, z0: lamp.z - 1, z1: lamp.z }
    : null;
  const inBasin = (x: number, z: number): boolean =>
    basin !== null && x >= basin.x0 && x <= basin.x1 && z >= basin.z0 && z <= basin.z1;
  if (basin !== null) {
    for (let z = basin.z0; z <= basin.z1; z++) {
      for (let x = basin.x0; x <= basin.x1; x++) {
        ctx.put(x, 0, z, "water", { level: "0" });
        c.n++;
      }
    }
    // The rim: every floor cell touching the water, written solid. This is the
    // half of the predicate the shell does not already guarantee.
    for (let z = it.z0; z <= it.z1; z++) {
      for (let x = it.x0; x <= it.x1; x++) {
        if (inBasin(x, z)) continue;
        const beside =
          inBasin(x + 1, z) || inBasin(x - 1, z) || inBasin(x, z + 1) || inBasin(x, z - 1);
        if (!beside) continue;
        ctx.put(x, 0, z, "smooth_sandstone");
        c.n++;
      }
    }
  }

  // The courtyard read: carpet at the corners of the surround, never on the
  // water and never a full ring — the middle of the floor is a walkway.
  for (const [cx, cz] of [
    [it.x0, it.z0],
    [it.x1, it.z1],
  ] as const) {
    if (!inBasin(cx, cz)) c.put1(cx, cz, "blue_carpet");
  }
  // Lattice trim under the plate on the two side walls: a riad's interior is
  // all screen. It hangs clear of the floor, so it cannot block anything.
  const trimY = Math.min(ctx.storyHeight - 1, ctx.wallTop - 1);
  if (trimY >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
      for (const [x, facing] of [
        [it.x0, "east"],
        [it.x1, "west"],
      ] as const) {
        c.stack(x, z, trimY, ctx.style["wall.trapdoor"] as string, shutter(facing));
      }
    }
  }
  c.put1(it.x1, it.z0, pottedAt(it.x1, it.z0));
  c.put1(it.x0, it.z1, pottedAt(it.x0, it.z1));
  c.put1(it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, it.z0, "barrel", { facing: "up", open: "false" });
}

/**
 * `cycladic_house` — whitewash, a flat parapeted roof and blue joinery.
 *
 * The wall field becomes **white concrete** with a scatter of quartz for the
 * unevenness lime render has; the roof is replaced by a level terrace with a
 * one-course parapet; and the joinery — a band under the plate, a shutter
 * beside every light — is **blue**, which is the whole of the island read.
 *
 * The outdoor stair to the roof that a real cycladic house wears is *not*
 * built: it would need either an apron run that floats over the doorstep or a
 * second grammar for an external flight, and this file may have neither.
 */
function fitCycladicHouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop - 1, (x, y, z) =>
      (x * 7 + y * 5 + z * 3) % 9 === 0 ? "quartz_block" : "white_concrete",
    );
    // The blue band at the plate, and the shutters beside the lights.
    for (const cell of ringOf(plan.sx, plan.sz)) {
      ctx.put(cell.x, ctx.wallTop, cell.z, "blue_terracotta");
      c.n++;
    }
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const facing: Cardinal =
        cell.z === -1 ? "south" : cell.z === plan.sz ? "north" : cell.x === -1 ? "east" : "west";
      const along = cell.x === -1 || cell.x === plan.sx ? cell.z : cell.x;
      if (along % 4 !== 1) continue;
      const y = Math.min(3, ctx.wallTop - 1);
      if (y < 2) continue;
      // A shutter is a trapdoor hung flat on the wall it belongs to, so
      // `facing` points *at* the building rather than away from it.
      ctx.put(cell.x, y, cell.z, ctx.style["wall.trapdoor"] as string, shutter(facing));
      c.n++;
    }
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += terrace(ctx, roof, "white_concrete", () => ({ block: "white_concrete", height: 1 }));
  }

  const it = ctx.interior;
  bedAlcove(ctx, "blue_bed");
  c.put1(it.x1, it.z1, "chest", { facing: "west", type: "single" });
  c.put1(it.x1, it.z0, "barrel", { facing: "up", open: "false" });
  table(ctx, c, it.x0, it.z1);
  c.put1(it.x0, it.z0, pottedAt(it.x0, it.z0));
}

/**
 * `adobe_pueblo` — earth render, a stepped roofline and protruding vigas.
 *
 * Three things carry it. The wall field becomes **terracotta** in two tones;
 * the roof is a flat terrace whose parapet **steps** — one course on one side
 * of the building, two on the other, keyed off position so opposite walls
 * agree — which is the massing a pueblo reads by; and the **vigas**, the roof
 * beams, protrude through the wall plane as whole stripped logs in the apron
 * ring at the plate line.
 *
 * The vigas are full opaque blocks and not fence posts or ends of trapdoors on
 * purpose: a viga is a log, and the block that reads as a log end is a log.
 */
function fitAdobePueblo(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) =>
      (x * 3 + y * 11 + z * 5) % 5 === 0 ? "terracotta" : "orange_terracotta",
    );
    // The vigas: log ends in the apron at the plate, every third bay, and
    // never over the doorstep.
    const vigaY = ctx.wallTop - 1;
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const onX = cell.x === -1 || cell.x === plan.sx;
      const onZ = cell.z === -1 || cell.z === plan.sz;
      if (onX && onZ) continue; // corners carry no beam
      const along = onX ? cell.z : cell.x;
      if (along < 1 || along > (onX ? plan.sz : plan.sx) - 2) continue;
      if (along % 3 !== 1) continue;
      ctx.put(cell.x, vigaY, cell.z, "stripped_spruce_log", { axis: onX ? "x" : "z" });
      c.n++;
    }
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += terrace(ctx, roof, "orange_terracotta", (x, z) => ({
      block: "terracotta",
      // The step: the north-west half of the parapet stands a course taller.
      height: x + z < (roof.sx + roof.sz) / 2 ? 2 : 1,
    }));
  }

  const it = ctx.interior;
  bedAlcove(ctx, "orange_bed");
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, it.z0, "chest", { facing: "west", type: "single" });
  table(ctx, c, it.x0, it.z1);
  c.put1(it.x0, it.z0, pottedAt(it.x0, it.z0));
}

/* -------------------------------------------------------------------------- */
/* the tropics, the steppe and the ice                                         */
/* -------------------------------------------------------------------------- */

/**
 * `stilt_house` — a jungle-timber box that reads as if it stood over water.
 *
 * It does **not** stand over water. There is no pond, no flooded apron and no
 * open fluid anywhere: the envelope stands on the ordinary ground the solver
 * gave it, exactly like every other building in this file. What makes the read
 * is joinery — a ring of **posts** in the apron rising to the plinth head, a
 * **porch trim** of trapdoors at the storey line, and a plank re-clad above a
 * dark under-plinth — so the eye supplies the water the terrain does not.
 */
function fitStiltHouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) =>
      (x + z) % 4 === 0 && y < ctx.wallTop ? "stripped_jungle_log" : "jungle_planks",
    );
    const fence = ctx.style["wall.fence"] as string;
    const trapdoor = ctx.style["wall.trapdoor"] as string;
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const onX = cell.x === -1 || cell.x === plan.sx;
      const along = onX ? cell.z : cell.x;
      // The posts: every other bay, one course of fence standing in the apron.
      // They are not on the doorstep and they are not on a route the lint
      // walks — the apron is skirt, not floor.
      if (along % 2 === 0) {
        // On conformed terrain the apron ground fills local y0; on a platform
        // (the Terrarium) it sits one lower, and a post standing on air fails
        // the lint's support-chain rule. A second course closes the gap — and
        // a two-course stilt is a better stilt anyway.
        if (ctx.blockAt(cell.x, 0, cell.z) === undefined) {
          ctx.put(cell.x, 0, cell.z, fence);
          c.n++;
        }
        ctx.put(cell.x, 1, cell.z, fence);
        c.n++;
      }
      // The porch trim, at the storey line.
      const y = Math.min(ctx.storyHeight, ctx.wallTop - 1);
      if (y >= 2) {
        const facing: Cardinal =
          cell.z === -1 ? "north" : cell.z === plan.sz ? "south" : cell.x === -1 ? "west" : "east";
        ctx.put(cell.x, y, cell.z, trapdoor, shutter(opposite(facing)));
        c.n++;
      }
    }
  }

  const it = ctx.interior;
  bedAlcove(ctx, "green_bed");
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, it.z0, "chest", { facing: "west", type: "single" });
  table(ctx, c, it.x0, it.z1);
  c.put1(it.x0, it.z0, pottedAt(it.x0, it.z0));
}

/**
 * `sod_house` — turf walls banded with coarse earth, under a grass roof.
 *
 * The humblest building in the file, and it should look it: one room, a bed, a
 * chest and a cooking pot. The walls are re-clad in **coarse dirt banded with
 * packed mud**, and the roof is rebuilt as a **shallow turf mound** — two
 * courses to the inset rather than one — surfaced in grass, so it reads as
 * something growing rather than as something built.
 */
function fitSodHouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y) =>
      y % 2 === 0 ? "packed_mud" : "coarse_dirt",
    );
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += corbel(ctx, roof, (x, y, z) => ((x + y + z) % 4 === 0 ? "coarse_dirt" : "grass_block"), "grass_block", 2);
  }

  const it = ctx.interior;
  bedAlcove(ctx, "brown_bed");
  c.put1(it.x1, it.z1, "chest", { facing: "west", type: "single" });
  c.put1(it.x1, it.z0, "cauldron", { level: "3" });
  c.put1(it.x0, it.z1, "barrel", { facing: "up", open: "false" });
}

/**
 * `igloo` — a snow dome over a snow drum, with a tunnel mouth at the door.
 *
 * The dome is the building: corbelled rings of **snow block**, one course per
 * inset so it closes fast and round, capped in **packed ice**. The walls under
 * it are re-clad in the same snow so the dome and the drum read as one piece.
 *
 * Two deliberate choices. The material is snow block and packed ice rather
 * than *ice* — ice melts under a light level the shell's own lanterns supply,
 * and a house that puddles is a bug with a long fuse. And the porch is a
 * **mouth**, not a tunnel: two snow blocks flanking the doorstep in the apron,
 * with the doorstep itself left open, because the physics lint walks the
 * building from its door and a porch over the door is a house with no way in.
 */
function fitIgloo(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) =>
      (x * 5 + y * 7 + z * 3) % 11 === 0 ? "packed_ice" : "snow_block",
    );
    // The tunnel mouth: the apron cells either side of the doorstep.
    const out = outsideDoor(ctx);
    if (out !== null) {
      for (const [ox, oz] of [
        [out.x + 1, out.z],
        [out.x - 1, out.z],
        [out.x, out.z + 1],
        [out.x, out.z - 1],
      ] as const) {
        const apron =
          ox === -1 || ox === plan.sx || oz === -1 || oz === plan.sz;
        if (!apron || onWayIn(ctx, ox, oz)) continue;
        for (let y = 1; y <= 2; y++) {
          ctx.put(ox, y, oz, "snow_block");
          c.n++;
        }
      }
    }
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += corbel(ctx, roof, (x, y, z) => ((x + y + z) % 7 === 0 ? "packed_ice" : "snow_block"), "packed_ice", 1);
  }

  const it = ctx.interior;
  bedAlcove(ctx, "light_blue_bed");
  c.put1(it.x1, it.z1, "chest", { facing: "west", type: "single" });
  c.put1(it.x1, it.z0, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, it.z1, "cauldron", { level: "0" });
}

/**
 * `thatched_roundhouse` — wattle walls under a deep conical thatch.
 *
 * The rect shell wears the roof of a round one. The thatch is corbelled a
 * course to the inset in **hay**, which is the steepest cone the machinery
 * draws and the right pitch for a roof that has to shed rain over a wall with
 * no gutter, and it is capped in a spruce **finial**. The walls are stripped
 * logs standing at every other bay with **mud** wattle between them.
 *
 * The floor is left open. A roundhouse's centre is its hearth and its living
 * space, and the shell already hangs the room's light over that column — so
 * the fit-out furnishes the perimeter and stays out of the middle entirely.
 */
function fitThatchedRoundhouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(
      ctx,
      plan,
      2,
      ctx.wallTop,
      (x, y, z) => {
        const along = x === 0 || x === plan.sx - 1 ? z : x;
        return along % 2 === 0 ? "stripped_oak_log" : "packed_mud";
      },
      (x, y, z) => {
        const along = x === 0 || x === plan.sx - 1 ? z : x;
        return along % 2 === 0 ? { axis: "y" } : undefined;
      },
    );
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += corbel(ctx, roof, () => "hay_block", "hay_block", 1, "spruce_fence");
  }

  const it = ctx.interior;
  bedAlcove(ctx, "brown_bed");
  c.put1(it.x0, it.z0, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, it.z1, "chest", { facing: "west", type: "single" });
  c.put1(it.x1, it.z0, "cauldron", { level: "3" });
  c.put1(it.x0, it.z1, pottedAt(it.x0, it.z1));
}

/* -------------------------------------------------------------------------- */
/* the new world                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `colonial_veranda_house` — a posted veranda under a genteel white box.
 *
 * The veranda is the archetype. Posts stand in the apron on the door face and
 * carry a **slab canopy** at the storey line, wrapping the corners as far as
 * the apron ring allows; the doorstep is left open under it, which is what a
 * veranda is for. The walls are birch clapboard with a white band at each
 * storey line, and every other bay carries a **shutter** beside its light.
 *
 * Inside it is a parlour: a table with a chair drawn up to it — the chair's
 * `facing` is its backrest, so it points away from the table — a bookshelf and
 * a chest.
 */
function fitColonialVerandaHouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    const storey = ctx.storyHeight;
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y) =>
      y === 2 || y === ctx.wallTop || y % storey === 0 ? "white_terracotta" : "birch_planks",
    );
    const fence = ctx.style["wall.fence"] as string;
    const canopy = ctx.style["stone.slab"] as string;
    const canopyY = Math.min(storey, ctx.wallTop - 1);
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const onX = cell.x === -1 || cell.x === plan.sx;
      const along = onX ? cell.z : cell.x;
      // The posts, every other bay, from the ground to under the canopy.
      if (along % 2 === 0) {
        for (let y = 1; y < canopyY; y++) {
          ctx.put(cell.x, y, cell.z, fence);
          c.n++;
        }
      }
      if (canopyY >= 2) {
        ctx.put(cell.x, canopyY, cell.z, canopy, { type: "bottom", waterlogged: "false" });
        c.n++;
      }
    }
  }

  const it = ctx.interior;
  const tx = it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0;
  table(ctx, c, tx, it.z1);
  // The chair west of the table: its backrest is west, so the sitter looks
  // east, at the table beside them.
  c.put1(it.x0, it.z1, ctx.style["stair.interior"] as string, {
    facing: "west",
    half: "bottom",
    shape: "straight",
  });
  c.put1(it.x1, it.z1, "bookshelf");
  c.put1(it.x1, it.z0, "chest", { facing: "west", type: "single" });
  c.put1(it.x0, it.z0, pottedAt(it.x0, it.z0));
}

/**
 * `hacienda` — stucco and terracotta round a working yard.
 *
 * The walls are smooth stucco with a **terracotta eave course** in the apron —
 * the tiled overhang a hacienda is read by — and an **arcade** suggestion on
 * the street face, a run of walls at the plinth head between the openings. The
 * yard is the other half: **hitching posts** and a **trough** in the apron on
 * the door face, both kept off the doorstep so the way in is a way in.
 */
function fitHacienda(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) =>
      (x * 3 + y * 5 + z * 7) % 6 === 0 ? "smooth_sandstone" : "sandstone",
    );
    // The tiled eave: terracotta stairs in the apron at the plate, sloping out.
    for (const cell of apronOf(plan.sx, plan.sz)) {
      ctx.put(cell.x, ctx.wallTop, cell.z, "terracotta");
      c.n++;
    }
    // The yard: a trough and two hitching posts on the door face, in the apron.
    const out = outsideDoor(ctx);
    if (out !== null) {
      const fence = ctx.style["wall.fence"] as string;
      for (const [ox, oz] of [
        [out.x + 2, out.z],
        [out.x - 2, out.z],
      ] as const) {
        const apron = ox >= -1 && ox <= plan.sx && oz >= -1 && oz <= plan.sz;
        const skirt = ox === -1 || ox === plan.sx || oz === -1 || oz === plan.sz;
        if (!apron || !skirt || onWayIn(ctx, ox, oz)) continue;
        // Same ground-step rule as the stilt posts: no post stands on air.
        if (ctx.blockAt(ox, 0, oz) === undefined) {
          ctx.put(ox, 0, oz, fence);
          c.n++;
        }
        ctx.put(ox, 1, oz, fence);
        c.n++;
      }
      for (const [ox, oz] of [
        [out.x + 1, out.z],
        [out.x - 1, out.z],
      ] as const) {
        const skirt = ox === -1 || ox === plan.sx || oz === -1 || oz === plan.sz;
        if (!skirt || onWayIn(ctx, ox, oz)) continue;
        // The trough stands on the ground wherever the ground actually is.
        const troughY = ctx.blockAt(ox, 0, oz) === undefined ? 0 : 1;
        ctx.put(ox, troughY, oz, "cauldron", { level: "3" });
        c.n++;
        break;
      }
    }
  }

  const it = ctx.interior;
  table(ctx, c, it.x1, it.z1);
  c.put1(it.x0, it.z1, "chest", { facing: "east", type: "single" });
  c.put1(it.x0, it.z0, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, it.z0, pottedAt(it.x1, it.z0));
  bedAlcove(ctx, "red_bed");
}

/**
 * `fachwerk_barn` — the tudor idiom at barn scale, with a hay floor.
 *
 * The wall field is white infill in a dark timber frame, but the frame is a
 * barn's rather than a house's: posts at every third bay, a rail at the plinth
 * head and under the plate, and an **X-brace** across each panel, drawn from
 * the two diagonals of the bay so both halves of the cross land on the same
 * cells whichever wall they are on.
 *
 * Inside, the hay: bales piled along the two side walls, two high wherever the
 * storey has the room, never up to the joists — a pile that reaches them is a
 * column through the room. The middle of the floor is the threshing floor and
 * stays empty.
 */
function fitFachwerkBarn(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(
      ctx,
      plan,
      2,
      ctx.wallTop,
      (x, y, z) => {
        if (y === 2 || y === ctx.wallTop) return "dark_oak_log";
        const along = x === 0 || x === plan.sx - 1 ? z : x;
        if (along % 3 === 0) return "dark_oak_log";
        // The brace: the two diagonals of a three-course bay, keyed off the
        // position along the wall and the height above the rail.
        const bay = ((along % 3) + 3) % 3;
        const rise = ((y - 3) % 3 + 3) % 3;
        if (bay === rise || bay + rise === 2) return "dark_oak_log";
        return "white_terracotta";
      },
      (x, y, z) => {
        if (y === 2 || y === ctx.wallTop) {
          return { axis: x === 0 || x === plan.sx - 1 ? "z" : "x" };
        }
        return { axis: "y" };
      },
    );
  }

  const it = ctx.interior;
  // The hay, on the wall rows only.
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    for (const x of [it.x0, it.x1]) {
      if (!c.put1(x, z, "hay_block", { axis: "y" })) continue;
      if (ctx.storyHeight >= 4) c.stack(x, z, 2, "hay_block", { axis: "z" });
    }
  }
  const end = farEnd(ctx);
  c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, end.z, "composter", { level: "0" });
  c.put1(it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, end.z, "barrel", { facing: "up", open: "false" });
}
