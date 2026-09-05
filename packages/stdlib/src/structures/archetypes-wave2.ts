/**
 * Archetype breadth, **wave two** — nine buildings across three domains.
 *
 * `archetypes.ts` owns the first six archetypes and the tag table;
 * `archetypes-civic.ts` owns the seven civic/rural ones, the walkability guard
 * and the exterior flourishes; `archetypes-blitz.ts` owns the ten-building
 * breadth wave and states the design law this file obeys. Wave two adds three
 * vernacular houses (a tudor row, a Mediterranean villa, a trullo), three
 * civic buildings (a courthouse, a post office, an infirmary) and three
 * industrial ones (a sawmill, a kiln, a tannery).
 *
 * ## An archetype is a fit-out, not a second grammar
 *
 * Read the header of `archetypes-blitz.ts` in full; it is the normative
 * statement. The short form: a fit-out runs **after** every shape stage and
 * writes into the same cell map, so it can re-clad a wall and rebuild a roof
 * without a line of `core.ts` changing — and every invariant the shell already
 * guarantees still holds. A tudor row is the house shell with its wall field
 * re-clad in plaster and studwork; a trullo is the same shell under a
 * corbelled drystone cone. Neither is a new grammar.
 *
 * ## The two rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} and in plan by the footprint plus
 *    the one-block apron the eave already uses.
 * 2. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take`.
 *
 * ## The field lessons this file was written against
 *
 * Five defects came back from a walkthrough of the earlier waves, and every
 * one of them is a rule here rather than a comment:
 *
 * - a **stair's `facing` is its high half** — the backrest. A seat therefore
 *   faces *away* from whatever the sitter is looking at, which is why the
 *   courthouse gallery is turned away from the bench, not towards it;
 * - a bare `flower_pot` renders as an **empty** pot. {@link pottedAt} picks a
 *   `potted_*` variant from position, so a pot always has something in it;
 * - the shell hangs a lantern over the **middle column** of the room at head
 *   height. No walking route here is one cell wide through that column: the
 *   courthouse aisle is two columns, and the cot ranges only go up both walls
 *   when the room is wide enough to keep three columns of floor between them;
 * - the fence-and-pressure-plate table is refused by the stack guard under a
 *   three-course storey, so {@link table} switches to a top slab there;
 * - a body-blocking prop on a one-cell circulation ring seals it. The kiln
 *   core, the tannery vats and the sawmill's stores all stand **on the wall
 *   row**, never in the middle of the floor.
 */

import type { Cardinal, LocalRect } from "./core.js";
import {
  buildingIdFromTags,
  defineBuildingDescriptors,
  type BuildingDescriptor,
} from "./descriptor.js";
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
 * The nine archetypes this file fits out, in domain order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`. The order is the one
 * the catalog reads in: vernacular, civic, industrial.
 */
export const WAVE2_BUILDING_ARCHETYPES = [
  "tudor_row",
  "mediterranean_villa",
  "trullo",
  "courthouse",
  "post_office",
  "infirmary",
  "sawmill",
  "kiln",
  "tannery",
] as const;

/** One of the archetypes this file fits out. */
export type Wave2BuildingArchetype = (typeof WAVE2_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isWave2Archetype(value: string): value is Wave2BuildingArchetype {
  return (WAVE2_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the breadth table and *before* the extended one, and every
 * tag below is one no earlier table claims. Three near misses are deliberate
 * and worth writing down, because each one would have been a silent theft:
 *
 * - `mill` belongs to the **windmill** and is not claimed here; a sawmill
 *   answers to `sawmill` and `lumber_mill`;
 * - `hospital` is not claimed here; the infirmary takes `infirmary` and
 *   `clinic` only. (It was an unimplemented catalog id when this wave shipped;
 *   wave three A's institutions now own it — see `archetypes-institution.ts`.)
 * - `gate` belongs to the **gatehouse**, so the courthouse takes `court` and
 *   `tribunal` rather than anything shorter.
 */
function wave2ArchetypeOfTags(tags: readonly string[]): Wave2BuildingArchetype | null {
  return buildingIdFromTags(WAVE2_BUILDING_DESCRIPTORS, tags);
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one.
 */
export function wave2FacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // A row house is all gable and studwork: a steep end wall and small
    // regular lights between the studs.
    case "tudor_row":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // The parapet takes the roof's height over, so ask for the shape with the
    // most room under it and then flatten it.
    case "mediterranean_villa":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    // The cone needs vertical room and the walls want to be almost blind.
    case "trullo":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "courthouse":
      return { windowShape: "tall", windowRhythm: "regular", roof: "hip" };
    case "post_office":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    case "infirmary":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    // A saw floor wants light and a wide gable to run long timber under.
    case "sawmill":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    // Heat, not daylight.
    case "kiln":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "tannery":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the exterior plan                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Clear everything the shell built above the eave plate, apron included.
 *
 * Two courses past `top` as well, for the chimney corbel and its chimney-pot
 * campfire: a replacement roof that cleared only to its own ceiling would
 * leave a fire burning over the ridge it deleted.
 */
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

/**
 * Blocks a re-clad may never overwrite.
 *
 * Wider than the blitz file's list by one family, and the difference is the
 * point: the keep re-clads over its own windows because a keep barely has any,
 * but a tudor row *is* its windows. Glass and panes are preserved, along with
 * the way in, the way up, the fire, and anything the physics lint holds to a
 * support rule.
 */
const PRESERVE = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

/**
 * Re-clad the wall ring between two courses.
 *
 * The one primitive every exterior routine here is built out of. `block` is a
 * pure function of position, so opposite walls agree and the result is
 * deterministic without a draw.
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

/** The masonry mix the drystone work draws from — the shell's stone palette. */
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

/* -------------------------------------------------------------------------- */
/* interior primitives                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A potted plant, chosen from position.
 *
 * A bare `flower_pot` renders as an **empty** pot, which a walkthrough of the
 * earlier waves reported from three different buildings. There is no such
 * thing as a pot with a default plant in it: the plant is part of the block
 * id. The choice is a pure function of the cell so the building stays
 * deterministic and so two pots on one wall are not the same plant.
 */
export function pottedAt(x: number, z: number): string {
  const kinds = [
    "potted_fern",
    "potted_azure_bluet",
    "potted_red_tulip",
    "potted_oxeye_daisy",
    "potted_cornflower",
    "potted_dandelion",
  ];
  return kinds[(((x * 5 + z * 3) % kinds.length) + kinds.length) % kinds.length] as string;
}

/**
 * One table cell, by the idiom the storey has headroom for.
 *
 * The trestle idiom — a fence stem with a pressure plate on top — is two
 * blocks in one column, and under a three-course storey the second one is
 * refused by the stack guard as an `interior.blocked_column`. What comes back
 * is a bare fence post, which reads as a bollard. A top slab is one block, sits
 * at table height, and is the idiom the earlier waves settled on for exactly
 * this case.
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
 * The middle column of the room — where the shell hangs its lantern.
 *
 * Read straight off `core.ts`'s own arithmetic. Nothing here routes a one-cell
 * walkway through it; the helper exists so an aisle can be widened *away* from
 * it rather than centred on it.
 */
function lanternColumn(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
}

/**
 * Lay one bed wherever the room will take it, head against a wall.
 *
 * `placeBed` is all-or-nothing and silent about which it was, so a fit-out
 * with exactly one bed in it cannot simply pick a corner and hope: the hearth
 * reserve, the stair columns and the door approach between them can eat any
 * particular anchor, and a one-bed room with no bed in it is the defect. This
 * walks the two side walls, foot one cell in and head on the wall, and asks
 * the floor's *own* `free` before spending the anchor — so the search uses the
 * same reserve the placement will.
 */
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

/**
 * The end of the room furthest from the door.
 *
 * The bench in a courthouse, the counter in a post office and the altar in a
 * church are all the same idea: the thing you walk *towards*. Returns the z of
 * that end and the cardinal a person standing in the room faces to look at it.
 */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
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
function furnishWave2(ctx: FitOutContext): number {
  if (!isWave2Archetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "tudor_row":
      fitTudorRow(ctx, c);
      break;
    case "mediterranean_villa":
      fitMediterraneanVilla(ctx, c);
      break;
    case "trullo":
      fitTrullo(ctx, c);
      break;
    case "courthouse":
      fitCourthouse(ctx, c);
      break;
    case "post_office":
      fitPostOffice(ctx, c);
      break;
    case "infirmary":
      fitInfirmary(ctx, c);
      break;
    case "sawmill":
      fitSawmill(ctx, c);
      break;
    case "kiln":
      fitKiln(ctx, c);
      break;
    case "tannery":
    default:
      fitTannery(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* descriptors — ordered building rows for registry (no side effects)          */
/* -------------------------------------------------------------------------- */

/**
 * Ordered building descriptors for this leaf pack — one row per local ID in
 * `WAVE2_BUILDING_ARCHETYPES` order. Tags preserve resolver equivalence
 * (canonical id first, then `wave2ArchetypeOfTags` aliases). Intentional
 * non-claims preserved: does not claim `mill` (windmill), `hospital`
 * (institution wave), or `gate` (gatehouse). Facade defaults and furnish
 * handle delegate to existing leaf behavior.
 */
function wave2TagsFor(id: Wave2BuildingArchetype): readonly string[] {
  switch (id) {
    case "tudor_row":
      return ["tudor_row", "half_timber"] as const;
    case "mediterranean_villa":
      return ["mediterranean_villa", "villa"] as const;
    case "trullo":
      return ["trullo"] as const;
    case "courthouse":
      return ["courthouse", "court", "tribunal"] as const;
    case "post_office":
      return ["post_office", "post"] as const;
    case "infirmary":
      return ["infirmary", "clinic"] as const;
    case "sawmill":
      return ["sawmill", "lumber_mill"] as const;
    case "kiln":
      return ["kiln", "pottery_kiln"] as const;
    case "tannery":
      return ["tannery", "tanner"] as const;
    default:
      return [id] as const;
  }
}

function wave2FacadeFor(id: Wave2BuildingArchetype): BuildingDescriptor["facadeDefaults"] {
  const raw = wave2FacadeDefaults(id);
  const hasAny = raw.windowShape !== undefined || raw.windowRhythm !== undefined || raw.roof !== undefined;
  return hasAny ? raw : undefined;
}

export const WAVE2_BUILDING_DESCRIPTORS = defineBuildingDescriptors(
  WAVE2_BUILDING_ARCHETYPES,
  {
    tags: wave2TagsFor,
    facadeDefaults: wave2FacadeFor,
    furnish: furnishWave2,
    dispatch: "standard",
  },
);


/* -------------------------------------------------------------------------- */
/* vernacular                                                                  */
/* -------------------------------------------------------------------------- */


/** The plaster field of a half-timbered wall. */
const TUDOR_PLASTER = "white_terracotta";
/** The studwork. Dark oak because that is what "tudor" means to a player. */
const TUDOR_FRAME = "dark_oak_log";

/**
 * `tudor_row` — plaster panels in a dark studwork frame, and a jettied trim.
 *
 * Three things make the read and all three are cheap. The wall field becomes
 * **white plaster**; a **stud** stands in every other column, with a
 * horizontal **band** at the plinth head, at each storey line and under the
 * eave; and a course of trapdoors in the apron at the storey line gives the
 * upper floor the look of a **jetty** overhanging the street, without the
 * upper floor actually being bigger than the envelope says it is.
 *
 * The interior is a row house: a table by the window, a chair to it, a chest
 * and a barrel against the end wall, a potted plant on the sill side. Nothing
 * stands in the middle of the floor.
 */
function fitTudorRow(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    const storey = ctx.storyHeight;
    c.n += reclad(
      ctx,
      plan,
      2,
      ctx.wallTop - 1,
      (x, y, z) => {
        // The bands: at the head of the plinth, at every storey line, and one
        // course under the plate. A band is what stops the studs reading as a
        // fence with plaster in it.
        if (y === 2 || y === ctx.wallTop - 1 || y % storey === 0) return TUDOR_FRAME;
        // The studs: every other column of the ring, and both corners of every
        // wall — a panel needs a post at each end of it.
        const along = x === 0 || x === plan.sx - 1 ? z : x;
        return along % 2 === 0 ? TUDOR_FRAME : TUDOR_PLASTER;
      },
      (x, y, z) => {
        if (y === 2 || y === ctx.wallTop - 1 || y % storey === 0) {
          // A band runs *along* its wall; a stud stands on end.
          return { axis: x === 0 || x === plan.sx - 1 ? "z" : "x" };
        }
        const along = x === 0 || x === plan.sx - 1 ? z : x;
        return along % 2 === 0 ? { axis: "y" } : undefined;
      },
    );
    // The jetty: a trapdoor course in the apron at each storey line. It lives
    // in the one-block ring the eave already occupies, so the envelope is
    // unchanged and the overhang is a shadow rather than a floor.
    const trapdoor = ctx.style["wall.trapdoor"] as string;
    for (let s = 1; s < ctx.floors; s++) {
      const y = s * storey;
      if (y >= ctx.wallTop) break;
      for (let x = -1; x <= plan.sx; x++) {
        for (let z = -1; z <= plan.sz; z++) {
          const apron = x === -1 || x === plan.sx || z === -1 || z === plan.sz;
          if (!apron) continue;
          const corner = (x === -1 || x === plan.sx) && (z === -1 || z === plan.sz);
          if (corner) continue;
          const facing: Cardinal = z === -1 ? "north" : z === plan.sz ? "south" : x === -1 ? "west" : "east";
          ctx.put(x, y, z, trapdoor, {
            facing: opposite(facing),
            half: "top",
            open: "false",
            powered: "false",
            waterlogged: "false",
          });
          c.n++;
        }
      }
    }
  }

  const it = ctx.interior;
  table(ctx, c, it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, it.z0 + 1 <= it.z1 ? it.z0 + 1 : it.z0);
  c.put1(it.x0, it.z0 + 1 <= it.z1 ? it.z0 + 1 : it.z0, ctx.style["stair.interior"] as string, {
    // The sitter faces east, into the room and the table; the backrest — which
    // is what `facing` names — is therefore west, against the wall.
    facing: "west",
    half: "bottom",
    shape: "straight",
  });
  c.put1(it.x1, it.z1, "chest", { facing: "west", type: "single" });
  c.put1(it.x1, it.z0, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, it.z1, pottedAt(it.x0, it.z1));
}

/**
 * `mediterranean_villa` — stucco walls, a flat roof and a corner pergola.
 *
 * The house shell re-clad in smooth sandstone, with a course of terracotta at
 * the plate as a cornice; the roof replaced by a **terrace** — a deck at the
 * course above the ceiling plane, a low sandstone parapet around it, and a
 * pergola of posts and lattice over one corner. The terrace is a place, which
 * is the whole difference between a flat roof and a missing one.
 */
function fitMediterraneanVilla(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx) ?? wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop - 1, (x, y, z) =>
      (x * 3 + y * 7 + z * 5) % 7 === 0 ? "cut_sandstone" : "smooth_sandstone",
    );
    // The cornice: terracotta at the plate, which is the shadow line a stucco
    // box needs or it reads as a crate.
    for (const cell of ringOf(plan.sx, plan.sz)) {
      ctx.put(cell.x, ctx.wallTop, cell.z, "terracotta");
      c.n++;
    }
  }
  if (plan !== null && plan.top - plan.base >= 2) {
    clearRoof(ctx, plan);
    // The terrace deck, over the ceiling the shell already laid.
    slab(ctx, plan.base, 0, plan.sx - 1, 0, plan.sz - 1, "smooth_sandstone");
    // The parapet.
    for (const cell of ringOf(plan.sx, plan.sz)) {
      ctx.put(cell.x, plan.base + 1, cell.z, "sandstone_wall", {
        north: "none",
        south: "none",
        east: "none",
        west: "none",
        up: "true",
        waterlogged: "false",
      });
      c.n++;
    }
    // The pergola, over the corner furthest from the door: four posts and a
    // lattice of trapdoors, both inside the parapet and both under `top`.
    const px = plan.sx >= 6 ? 2 : 1;
    const pz = plan.sz >= 6 ? 2 : 1;
    const fence = ctx.style["wall.fence"] as string;
    const trapdoor = ctx.style["wall.trapdoor"] as string;
    for (let x = px; x <= px + 2 && x < plan.sx - 1; x++) {
      for (let z = pz; z <= pz + 2 && z < plan.sz - 1; z++) {
        const post = (x === px || x === px + 2) && (z === pz || z === pz + 2);
        if (post) {
          ctx.put(x, plan.base + 1, z, fence);
          c.n++;
        }
        if (plan.base + 2 > plan.top) continue;
        ctx.put(x, plan.base + 2, z, trapdoor, {
          facing: "north",
          half: "top",
          open: "false",
          powered: "false",
          waterlogged: "false",
        });
        c.n++;
      }
    }
  }

  // Inside: a courtyard house's furniture, all of it against the walls.
  const it = ctx.interior;
  table(ctx, c, it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, it.z1);
  c.put1(it.x1, it.z1, ctx.style["stair.interior"] as string, {
    // Facing east: the backrest is on the east wall and the sitter looks west,
    // at the table beside them.
    facing: "east",
    half: "bottom",
    shape: "straight",
  });
  c.put1(it.x0, it.z0, pottedAt(it.x0, it.z0));
  c.put1(it.x1, it.z0, pottedAt(it.x1, it.z0));
  c.put1(it.x0, it.z1, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, it.z0, "cauldron", { level: "3" });
}

/**
 * `trullo` — a corbelled drystone cone over a single round-feeling room.
 *
 * The cone is the building. It is built the way a real trullo is: rings of dry
 * stone, each one course higher and one cell further in, closing on a
 * capstone. That is the same machinery the wizard's tower uses for its spire,
 * with two differences that are the whole character — the stone is the shell's
 * own rubble palette rather than dressed roof material, and the walls under it
 * are re-clad in the same rubble from the plinth up, so the cone and the drum
 * read as one piece of masonry.
 *
 * The interior is deliberately sparse: a trullo is one room and a hearth.
 */
function fitTrullo(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  if (plan !== null) {
    const stone = masonry(ctx);
    c.n += reclad(ctx, plan, 2, ctx.wallTop, stone);
    clearRoof(ctx, plan);
    // The corbel: one course per inset, so the cone rises one in one.
    let k = 0;
    let capY = plan.base;
    let cap: LocalRect = plan.rect;
    for (let y = plan.base; y <= plan.top; y++, k++) {
      const x0 = k;
      const x1 = plan.sx - 1 - k;
      const z0 = k;
      const z1 = plan.sz - 1 - k;
      if (x0 > x1 || z0 > z1 || (k > 0 && degenerate(x0, x1, z0, z1))) break;
      capY = y;
      cap = { x0, z0, x1, z1 };
      c.n++;
      if (k === 0) {
        // The first course is solid: it is the lid of the room below.
        slab(ctx, y, x0, x1, z0, z1, stone(x0, y, z0));
        continue;
      }
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
          ctx.put(x, y, z, stone(x, y, z));
        }
      }
    }
    // The capstone — the *pinnacolo*. It closes the last ring, so the cone
    // finishes on a face rather than on a hole.
    slab(ctx, capY, cap.x0, cap.x1, cap.z0, cap.z1, "chiseled_stone_bricks");
    if (capY + 1 <= plan.top) {
      ctx.put((cap.x0 + cap.x1) >> 1, capY + 1, (cap.z0 + cap.z1) >> 1, "chiseled_stone_bricks");
      c.n++;
    }
  }

  const it = ctx.interior;
  // The bed: the foot one cell in from the wall, the head against it. A trullo
  // is one small room and the hearth takes a corner of it, so the alcove is
  // *searched* for rather than assumed — the first pair of cells the ground
  // floor's own reserve will give up, walking the two side walls in order.
  bedAlcove(ctx, "white_bed");
  c.put1(it.x1, it.z1, "chest", { facing: "west", type: "single" });
  c.put1(it.x1, it.z0, "cauldron", { level: "3" });
  c.put1(it.x0, it.z1, pottedAt(it.x0, it.z1));
}

/* -------------------------------------------------------------------------- */
/* civic                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `courthouse` — a bench, a bar and a public gallery.
 *
 * The room is read end to end. At the far end from the door, a **dais** of two
 * slab courses with the judge's lectern on it; a course in front of it, the
 * **bar** — short runs of rail from each side wall that never meet, so the
 * floor cannot be cut in two by them; and behind that the **gallery**, rows of
 * stair benches either side of a **two-column aisle**.
 *
 * The aisle is two columns and not one on purpose. The shell hangs its lantern
 * over the middle column of the room at head height, and a one-cell aisle
 * centred there is a corridor with a light in the middle of it — which the
 * physics lint reports as an unreachable half-room and a player experiences as
 * a wall. The aisle is therefore the middle column *and its neighbour*.
 *
 * Every bench faces **away** from the bench it is looking at: a stair's
 * `facing` names its high half, which is the backrest. Turning a gallery pew
 * "towards" the judge sits the whole public with their backs to him.
 */
function fitCourthouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    // The trim: a slab cornice in the apron at the plate line. It is the same
    // ring the eave uses, and it is the cheapest way to make a box dignified.
    const slabBlock = ctx.style["stone.slab"] as string;
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) {
        const outside = x === -1 || x === plan.sx || z === -1 || z === plan.sz;
        if (!outside) continue;
        ctx.put(x, ctx.wallTop, z, slabBlock, { type: "top", waterlogged: "false" });
        c.n++;
      }
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  // The aisle: the lantern column and the cell beside it, kept inside the room.
  const aisleA = lamp.x;
  const aisleB = lamp.x + 1 <= it.x1 ? lamp.x + 1 : lamp.x - 1;
  const backrest = opposite(end.look);
  const step = end.look === "north" ? 1 : -1;

  // The dais and the bench itself.
  const daisSlab = ctx.style["stone.slab"] as string;
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    // The judge's own cell is left for the judge: a dais slab there takes it,
    // and `put1` refuses a second prop on an occupied cell rather than
    // replacing it, so the lectern would simply never be laid.
    if (x === lamp.x) continue;
    c.put1(x, end.z, daisSlab, { type: "top", waterlogged: "false" });
  }
  c.put1(lamp.x, end.z, "lectern", {
    // The judge looks down the room, at the gallery: away from the end wall.
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  // The clerk's table and the evidence chest, at the ends of the dais.
  c.put1(it.x0, end.z, "chest", { facing: end.look === "north" ? "south" : "north", type: "single" });
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });

  // The bar: two short rails from the side walls, with the middle of the room
  // open between them. A rail across the room is a wall.
  const barZ = end.z + step * 2;
  if (barZ >= it.z0 && barZ <= it.z1) {
    const fence = ctx.style["wall.fence"] as string;
    for (const x of [it.x0, it.x0 + 1, it.x1 - 1, it.x1]) {
      if (x < it.x0 || x > it.x1 || x === aisleA || x === aisleB) continue;
      c.put1(x, barZ, fence);
    }
  }

  // The gallery: rows of benches from the door end back towards the bar, in
  // bays of two with a gap between them.
  const galleryFrom = end.z + step * 4;
  const galleryTo = end.look === "north" ? it.z1 : it.z0;
  for (let k = 0; ; k++) {
    const z = galleryFrom + step * k;
    if (step > 0 ? z > galleryTo : z < galleryTo) break;
    if (k % 3 === 2) continue;
    for (let x = it.x0; x <= it.x1; x++) {
      if (x === aisleA || x === aisleB) continue;
      c.put1(x, z, ctx.style["stair.interior"] as string, {
        facing: backrest,
        half: "bottom",
        shape: "straight",
      });
    }
  }
}

/**
 * `post_office` — a counter, a wall of pigeonholes and the parcel floor.
 *
 * The counter runs along the far wall as a low run of dressed timber with a
 * sign standing on it; behind it, barrels stacked two high are the
 * **pigeonholes**; the near corners carry chests of parcels. Everything is on
 * a wall row, so the public side of the room is one open floor.
 */
function fitPostOffice(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const counter = ctx.style["wall.frame"] as string;
  const lamp = lanternColumn(it);

  // The counter, along the far wall.
  let signed = false;
  for (let x = it.x0; x <= it.x1; x++) {
    if (!c.put1(x, end.z, counter, { axis: "x" })) continue;
    // One banner, over the middle of the counter — a banner and not a sign,
    // deliberately: a sign block demands a paired block entity the structure
    // op stream cannot carry, and the physics lint rightly flags the orphan.
    // A plain banner needs none and reads as the office's standard.
    if (!signed && x === lamp.x) {
      signed = c.stack(x, end.z, 2, "white_banner", {
        rotation: end.look === "north" ? "8" : "0",
      });
    }
  }
  if (!signed) {
    signed = c.stack(it.x0, end.z, 2, "white_banner", {
      rotation: end.look === "north" ? "8" : "0",
    });
  }

  // The pigeonholes: barrels against the two side walls, stacked where the
  // storey has the headroom for it.
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z + it.z0) % 2 !== 0) continue;
    for (const x of [it.x0, it.x1]) {
      if (!c.put1(x, z, "barrel", { facing: "up", open: "false" })) continue;
      c.stack(x, z, 2, "barrel", { facing: "up", open: "false" });
    }
  }

  // The parcel floor: crates by the door end.
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
  c.put1(it.x1, nearZ, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
}

/**
 * `infirmary` — cots, screens between them, and an apothecary corner.
 *
 * Cots go up the side walls with the **head against the wall and the foot into
 * the room**, which is what `placeBed` means by `head = foot + facing`. A
 * banner stands between neighbouring cots as a privacy screen. The apothecary
 * works one corner: a brewing stand and a cauldron, both on the wall row and
 * both diagonal to each other, so removing either cannot pinch a walkway.
 *
 * The second range of cots is only laid when the room is wide enough to keep
 * **three** columns of floor between the two ranges. Two ranges in a five-wide
 * room leave a single-cell corridor straight through the column the shell
 * hangs its lantern in, which is a room with a wall across the middle of it.
 */
function fitInfirmary(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const width = it.x1 - it.x0 + 1;
  const ranges: readonly { readonly x: number; readonly facing: Cardinal }[] =
    width >= 7
      ? [
          { x: it.x0 + 1, facing: "west" },
          { x: it.x1 - 1, facing: "east" },
        ]
      : [{ x: it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, facing: "west" }];

  for (const range of ranges) {
    for (let z = it.z0; z <= it.z1; z += 2) {
      ctx.placeBed(range.x, z, range.facing, "white_bed");
    }
    // The screens: a banner on the wall row between one cot and the next.
    for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
      const wallX = range.facing === "west" ? it.x0 : it.x1;
      c.put1(wallX, z, "white_banner", { rotation: range.facing === "west" ? "4" : "12" });
    }
  }

  // The apothecary: the middle of the far wall rather than a corner of it.
  // The corners are cot heads — the ranges above start at `z0` — and `put1`
  // refuses an occupied cell rather than replacing it, so a corner apothecary
  // is an apothecary that never gets built.
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  c.put1(lamp.x, end.z, "brewing_stand", {
    has_bottle_0: "false",
    has_bottle_1: "false",
    has_bottle_2: "false",
  });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "cauldron", { level: "3" });
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, nearZ, pottedAt(it.x0, nearZ));
}

/* -------------------------------------------------------------------------- */
/* industrial                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `sawmill` — a saw run down one wall, timber down the other.
 *
 * The saw is a run of stonecutters, which is the only block in the game whose
 * model is a blade on a bench. Facing them across the floor: **log stores**,
 * whole logs stacked against the opposite wall in the axis they were felled
 * in, and **plank stacks** at the near end. The middle of the room is the deck
 * a sawyer runs timber down, and nothing stands in it.
 */
function fitSawmill(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const log = ctx.style["wall.accent"] as string;
  const planks = ctx.style["wall.primary"] as string;

  // The saw run: benches along the east wall, spaced so a sawyer can stand
  // between them.
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    c.put1(it.x1, z, "stonecutter", { facing: "west" });
  }
  // The log stores: stacked against the west wall, never to the ceiling — a
  // pile that reaches the joists is a column through the room.
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 3 !== 0) continue;
    if (!c.put1(it.x0, z, log, { axis: "z" })) continue;
    if (ctx.storyHeight >= 4) c.stack(it.x0, z, 2, log, { axis: "z" });
  }
  // The plank stacks and the sorting bench, at the far end.
  c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, end.z, planks);
  c.put1(it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, end.z, "crafting_table");
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "composter", { level: "0" });
}

/**
 * `kiln` — a brick core against one wall, and racks drying beside it.
 *
 * The core is two cells of brickwork on the **wall row** with a campfire in
 * the mouth of it, one course up, so the smoke rises inside the building's own
 * chimney line. It is against a wall and not in the middle of the floor for a
 * reason a walkthrough supplied: a campfire is a body-blocking cell, and a
 * body-blocking cell on a one-wide circulation ring seals the room.
 *
 * The drying racks are trapdoors on the opposite wall at shoulder height —
 * the cheapest honest shelf the block palette has.
 */
function fitKiln(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);

  // The core: brickwork on the wall row at the far end.
  let mouth: { x: number; z: number } | null = null;
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 !== 0) continue;
    if (x === it.x0 || x === it.x1) continue;
    if (!c.put1(x, end.z, "bricks")) continue;
    if (mouth === null) mouth = { x, z: end.z };
  }
  // The fire, in the mouth of the core rather than on the floor of the room.
  if (mouth !== null && ctx.storyHeight >= 4) {
    c.stack(mouth.x, mouth.z, 2, "campfire", {
      facing: end.look === "north" ? "south" : "north",
      lit: "false",
      signal_fire: "false",
      waterlogged: "false",
    });
  }
  // The furnaces either side of it, still on the wall row.
  c.put1(it.x0, end.z, "furnace", { facing: end.look === "north" ? "south" : "north", lit: "false" });
  c.put1(it.x1, end.z, "smoker", { facing: end.look === "north" ? "south" : "north", lit: "false" });

  // The drying racks: trapdoors on the two side walls, at shoulder height, on
  // cells whose floor is clear so the rack never becomes a blocked column.
  const trapdoor = ctx.style["wall.trapdoor"] as string;
  const rackY = Math.min(2, ctx.storyHeight - 1);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    for (const [x, facing] of [
      [it.x0, "east"],
      [it.x1, "west"],
    ] as const) {
      c.stack(x, z, rackY, trapdoor, {
        facing,
        half: "top",
        open: "false",
        powered: "false",
        waterlogged: "false",
      });
    }
  }
  // The clay store and the water butt.
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "cauldron", { level: "3" });
}

/**
 * `tannery` — soaking vats, stretching frames and drying lines.
 *
 * The vats are brown terracotta pits sunk into the **wall row** with a
 * cauldron of liquor beside them; the frames are pairs of stripped-log posts
 * up the opposite wall with a trapdoor stretched between them, which is a hide
 * on a frame at the only fidelity the block palette allows; and a line of
 * trapdoors under the plate is the drying line.
 *
 * Everything hugs a wall. A tannery's floor is the wettest, busiest floor in a
 * village and it needs to be empty.
 */
function fitTannery(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const post = ctx.style["wall.frame"] as string;
  const trapdoor = ctx.style["wall.trapdoor"] as string;

  // The vats, up the west wall, with liquor between them.
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 3 === 0) c.put1(it.x0, z, "brown_terracotta");
    else if ((z - it.z0) % 3 === 1) c.put1(it.x0, z, "cauldron", { level: "3" });
  }
  // The stretching frames, up the east wall: a post, and a hide on it.
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    if (!c.put1(it.x1, z, post, { axis: "y" })) continue;
    c.stack(it.x1, z, Math.min(2, ctx.storyHeight - 1), trapdoor, {
      facing: "west",
      half: "top",
      open: "false",
      powered: "false",
      waterlogged: "false",
    });
  }
  // The drying line under the plate: trapdoors hung from the ceiling plane,
  // clear of the floor entirely, and only on a single-storey building where
  // that plane is the roof rather than somebody's bedroom floor.
  const lineY = ctx.wallTop - 1;
  if (ctx.floors === 1 && lineY >= 3) {
    for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
      if (ctx.blockAt(x, lineY, it.z0 + 1) !== undefined) continue;
      ctx.put(x, lineY, it.z0 + 1, trapdoor, {
        facing: "north",
        half: "top",
        open: "false",
        powered: "false",
        waterlogged: "false",
      });
      c.n++;
    }
  }
  // The finishing end: a bench, the stores and the beam.
  c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, end.z, "smithing_table");
  c.put1(it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, end.z, "barrel", { facing: "up", open: "false" });
}
