/**
 * The **classical Mediterranean pack, second half** — the three entries of
 * that are buildings rather than props.
 *
 * The pack's thesis is the Troy verdict: `sun_clay` gave the town the right
 * *palette* and every *form* was still a medieval one, so a sandstone village
 * is what a stranger saw. These three are forms — a shed the length of a hull
 * with its whole front open to the water, a fountain that is a screen wall
 * with basins under it, and a press with a beam across the room.
 *
 * - `ship_shed` — the *neosoikos*: an open-fronted shed on a slipway floor;
 * - `nymphaeum` — the monumental fountain: a niched screen and its basins;
 * - `olive_press` — the beam press, its weight stone and its ranked jars.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it without restating it:
 * an archetype is a **fit-out**, not a second grammar. Everything here runs
 * after the shape stages and writes into the same cell map — the ship shed is
 * the shell with its front punched out and a lane laid down the floor plane,
 * the nymphaeum is the shell with water written into the floor plane on the
 * bathhouse's own argument. Not a line of `core.ts` moves for any of them.
 *
 * ## The rules, inherited from the sanctum pack and paid for there
 *
 * 1. **Nothing leaves the envelope**: exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} and in plan by the footprint plus
 *    the one-block apron the eave already uses.
 * 2. **Solid per course, never a ring per course** — a rebuilt mass whose
 *    courses are rings leaves its outermost cells with six air faces, which is
 *    the `floating.isolated` rule exactly. Nothing here rebuilds a roof, and
 *    the one mass it does build (the shed's front lintel) is continuous.
 * 3. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take` — the door approach, the stair columns and the connectivity
 *    guard, none of them restated here. The two things that do *not* go
 *    through it are the nymphaeum's water and its screen, and both are argued
 *    below rather than assumed.
 * 4. **The lantern column stays clear**: the shell hangs a lantern over the
 *    middle of the room at head height, so nothing here stands in that column.
 * 5. **The fluid argument is the bathhouse's, unchanged.** The nymphaeum's
 *    water goes into the floor plane at `y = 0` in a rect inset from the
 *    interior, so under every water cell is the shell's foundation skirt and
 *    beside every water cell is pool or a floor cell the shell wrote solid. No
 *    prop ever stands on a water cell.
 * 6. **No sign blocks**, no bare `flower_pot`, and `cauldron` takes no
 *    properties — the vessel with a `level` is `water_cauldron`.
 * 7. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position.
 */

import { buildingIdFromTags, defineBuildingDescriptors } from "./descriptor.js";
import type { BuildingDescriptor } from "./descriptor.js";
import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
  type RebuildPlan,
  wallPlan,
} from "./archetypes-civic.js";
import { pottedAt } from "./archetypes-wave2.js";
import { cardinalStep, type Cardinal, type LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The three archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`, straight after the
 * siegeworks pack, and mirrored in the same order by the spec package's
 * `KNOWN_BUILDING_ARCHETYPES` — where the order is asserted element by
 * element, so it is load-bearing in both places.
 */
export const CLASSICAL_B_BUILDING_ARCHETYPES = [
  "ship_shed",
  "nymphaeum",
  "olive_press",
] as const;

/** One of the archetypes this file fits out. */
export type ClassicalBBuildingArchetype = (typeof CLASSICAL_B_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isClassicalBArchetype(value: string): value is ClassicalBBuildingArchetype {
  return (CLASSICAL_B_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after the siegeworks table and well before the
 * extended one. This pack claims **only words derived from its own three ids
 * and their catalog notes**, and the deliberate non-claims are the point of
 * this comment — every one of them is a word an earlier table, an earlier
 * prop, or a plainer building has the better claim to:
 *
 * - bare **`shed`** is left unclaimed, and so is `boat_shed`: `boat_shed`
 *   already reaches the boathouse, and a document that says `shed` is asking
 *   for a shed rather than for a two-hundred-year-old slipway. The ship shed
 *   therefore answers to `ship_shed` and `neosoikos` only;
 * - **`slipway`** is deliberately not claimed either — the word belongs beside
 *   `shipyard`, which is a different building the catalog already ships;
 * - bare **`fountain`** is the *prop's* — `prop.place@0` has built a fountain
 *   since G3 — so the nymphaeum takes `nymphaeum` and `monumental_fountain`,
 *   and leaves `fountain`, `well` and `spring` where they are;
 * - bare **`press`** and bare **`mill`** are left alone: `mill` reaches the
 *   windmill and has since wave two, and `press` on its own is as likely to be
 *   a printing press. The olive press takes `olive_press`, `oil_press` and
 *   `olive_mill` — all three compounds, none of them greedy;
 * - **`arch`** and **`triumphal_arch`** are not here at all: the memorial
 *   arch's table claims them, and this pack's triumphal arch is a *prop*, so
 *   it is asked for by name rather than through a tag.
 */
function classicalBArchetypeOfTags(
  tags: readonly string[],
): ClassicalBBuildingArchetype | null {
  return buildingIdFromTags(CLASSICAL_B_BUILDING_DESCRIPTORS, tags);
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * - the **ship shed** is a working shed whose whole front is a hole, so it
 *   asks for no windows at all and a `gable` — the long ridge is what makes a
 *   row of sheds read as a row;
 * - the **nymphaeum** is a display front: `hip`, which leaves the most room
 *   between the eave plate and the allowance for the cornice, and sparse tall
 *   openings so the screen inside is what the light falls on;
 * - the **olive press** is a farm building and asks for a farm building's
 *   face: a gable, and few windows.
 */
export function classicalBFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "ship_shed":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "nymphaeum":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
    case "olive_press":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the shared plan                                                             */
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

/** True when a cell is the doorstep or the door column itself. */
function onWayIn(ctx: FitOutContext, x: number, z: number): boolean {
  if (ctx.door === null) return false;
  if (x === ctx.door.x && z === ctx.door.z) return true;
  const out = outsideDoor(ctx);
  return out !== null && out.x === x && out.z === z;
}

/** Blocks a re-clad may never overwrite — the sanctum pack's list, unchanged. */
const PRESERVE = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

/** Re-clad the wall ring between two courses. `block` is a pure function of position. */
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

/** Ashlar — the same palette laid in courses rather than in a scatter. */
function ashlar(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (_x, y, _z) => (y % 4 === 0 ? accent : primary);
}

/**
 * Fill the ground course under an apron cell when the ground there is air.
 *
 * Wave 4B's cathedral lesson: the apron is not always at `y = 1`, and a pier
 * whose foot is air is a pier standing on nothing.
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

/** The end of the room furthest from the door, and the way a person looks at it. */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/*
 * THE CORNICE THAT WAS DELETED, AND WHY IT CANNOT COME BACK ALONE.
 *
 * These three buildings each carried a slab cornice in the apron at the eave
 * course, copied from the sanctum pack's temple. It cost seven
 * `floating.slab` findings in the terrarium readback — *"air on every side"* —
 * and the reason is the difference between the two packs, not a mistake in the
 * copy: the temple's cornice lands on the **entablature its peristyle carried
 * up the apron**, so every slab has a column head under it. None of these
 * three has a colonnade, so the same ring of slabs was a ring of slabs floating
 * one block off the wall.
 *
 * The rule this file now states for itself: **nothing goes in the apron unless
 * something in the apron is holding it up.** A cornice here would have to
 * bring its own piers, and a shed, a fountain screen and a farm press do not
 * want piers. So there is no cornice.
 */

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this file's archetypes.
 *
 * Returns the number of blocks written, which `furnish` adds to its own count.
 * Zero, and not one cell touched, for anything that is not ours.
 */
function furnishClassicalB(ctx: FitOutContext): number {
  if (!isClassicalBArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "ship_shed":
      fitShipShed(ctx, c);
      break;
    case "nymphaeum":
      fitNymphaeum(ctx, c);
      break;
    case "olive_press":
    default:
      fitOlivePress(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the ship shed                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `ship_shed` — the *neosoikos*, and the only building in the catalog whose
 * defining feature is a **hole**.
 *
 * A ship shed is a hull's garage: one hull wide, longer than the hull, and
 * open at the water end so the hull can be run up the slipway on rollers.
 * Three moves carry it, and the first is the whole silhouette:
 *
 * - **the open front** — the wall **opposite the door** taken out between the
 *   corner piers, from the floor to one course under the plate, with the plate
 *   course left as a continuous **lintel** over it. Corner piers and a lintel
 *   are what make a hole in a wall read as an opening rather than as damage,
 *   and the lintel is continuous so no cell of it is a full cube with six air
 *   faces. *Opposite the door* is the correction this building cost: the first
 *   version opened the door's **own** face, which deleted the door block along
 *   with the wall, and a shell with no door is a shell the physics lint's
 *   walking agent has no way into — five `traversal.no_start` findings in the
 *   terrarium readback, one per exhibit cell. The real neosoikos wants it this
 *   way round anyway: the open end faces the water, the door is the landward
 *   side door, and now the fit-out cannot destroy the way in even by accident,
 *   because {@link openFront} also refuses to write over a door;
 * - **the slipway** — a paved lane written into the floor plane down the
 *   middle of the shed, running out through the opening. It is the floor
 *   plane, so it takes nothing away from the room's walkable area;
 * - **the rollers and the cradle** — logs laid across the lane at intervals
 *   and posts up both sides of it, each of them one cell in a three-cell lane
 *   so the lane is never closed. Both go through {@link PropCounter}, so the
 *   walkability guard refuses anything that would strand the floor.
 *
 * Outside, an apron **stylobate** course under the walls, and that is
 * deliberately all: a shed is a working building and a colonnade on it would be
 * a lie — and nothing else may go in the apron, because nothing in the apron is
 * holding anything up.
 */
function fitShipShed(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  const it = ctx.interior;
  const stone = ctx.style["foundation.primary"] as string;

  if (plan !== null) {
    c.n += reclad(ctx, plan, 1, ctx.wallTop, masonry(ctx));
    // The stylobate: the apron grounded all round, so nothing above it stands
    // on air, and the shed sits on a step the way a slipway building does.
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      footing(ctx, c, cell.x, cell.z, stone);
    }
    openFront(ctx, c, plan);
  }

  // The slipway: three cells wide down the middle, in the floor plane.
  const lane = lanternColumn(it).x;
  const paving = ctx.style["foundation.accent"] as string;
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = lane - 1; x <= lane + 1; x++) {
      if (x < it.x0 || x > it.x1) continue;
      ctx.put(x, 0, z, (x + z) % 3 === 0 ? paving : stone);
      c.n++;
    }
  }

  // The rollers: one log across the lane every third cell, laid on the middle
  // column only, so a walker can always pass either side of it.
  const lamp = lanternColumn(it);
  const log = ctx.style["wall.accent"] as string;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 3) {
    if (z === lamp.z) continue;
    c.put1(lane, z, log, { axis: "x" });
  }

  // The cradle: posts up both flanks of the lane, clear of the lane itself.
  const post = ctx.style["wall.fence"] as string;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 4) {
    for (const x of [lane - 2, lane + 2]) {
      if (x < it.x0 || x > it.x1) continue;
      c.put1(x, z, post);
    }
  }

  // The shipwright's corner: pitch, tools and a coil of rope, at the far end
  // and off the lane.
  const end = farEnd(ctx);
  if (it.x0 < lane - 1) {
    c.put1(it.x0, end.z, "cauldron");
    c.put1(it.x0, end.z === it.z0 ? end.z + 1 : end.z - 1, "barrel", {
      facing: "up",
      open: "false",
    });
  }
  if (it.x1 > lane + 1) {
    c.put1(it.x1, end.z, "crafting_table");
  }
}

/**
 * Take the wall **opposite the door** out between the corner piers.
 *
 * The plate course stays: a lintel over an opening is what tells the eye the
 * wall is still a wall. The two cells at each end stay too, which are the
 * piers the lintel lands on — an opening that runs into the corner is a
 * building with a corner missing.
 *
 * Two guards, and both of them are the same lesson at different distances:
 *
 * - the face is the **opposite** of the door's, so the way in is never in the
 *   wall being removed;
 * - and every cell is checked against {@link PRESERVE} before it is cleared
 *   anyway, so a door, a ladder, a window or a lantern the shell put in that
 *   wall survives whatever the face arithmetic decides. The lint that caught
 *   the first version reads the **world**: it looks for a door block and walks
 *   in from it, so a fit-out that removes a door does not make a building with
 *   a wide entrance — it makes a building with no entrance at all.
 */
function openFront(ctx: FitOutContext, c: PropCounter, plan: RebuildPlan): void {
  const face: Cardinal = ctx.door === null ? "south" : opposite(ctx.door.face);
  const head = Math.max(1, ctx.wallTop - 1);
  const piers = 2;
  const clearRun = (
    from: number,
    to: number,
    at: (i: number) => { x: number; z: number },
  ): void => {
    for (let i = from; i <= to; i++) {
      const cell = at(i);
      // Never over the way in, never over anything on the support chain.
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      for (let y = 1; y <= head; y++) {
        const standing = ctx.blockAt(cell.x, y, cell.z);
        if (standing !== undefined && PRESERVE.test(standing.block)) continue;
        ctx.put(cell.x, y, cell.z, "air");
        c.n++;
      }
    }
  };
  if (face === "north" || face === "south") {
    const z = face === "north" ? 0 : plan.sz - 1;
    if (plan.sx - 2 * piers < 1) return;
    clearRun(piers, plan.sx - 1 - piers, (x) => ({ x, z }));
  } else {
    const x = face === "west" ? 0 : plan.sx - 1;
    if (plan.sz - 2 * piers < 1) return;
    clearRun(piers, plan.sz - 1 - piers, (z) => ({ x, z }));
  }
}

/* -------------------------------------------------------------------------- */
/* the nymphaeum                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `nymphaeum` — the monumental fountain: a screen with water under it.
 *
 * Not a pool with a building round it. The read is the **screen**: a wall of
 * niches at the head of the room, each niche a cell of the far row left out of
 * the masonry with a light in it and a carved back, and the basins are the
 * shallow rectangle of water lying in front of it. A walker's eye goes to the
 * niches; the water is what tells them why the niches are there.
 *
 * The fluid argument is the bathhouse's, unchanged and for its reasons: the
 * water is written **into the floor plane** at `y = 0` in a rect inset from
 * the interior, so under every water cell is the shell's own foundation skirt,
 * beside every water cell is pool or a floor cell already written solid, and
 * no prop ever stands on one. The basin is deliberately shallow in `z` — two
 * rows against the screen — which leaves the rest of the floor a single open
 * region a visitor can walk round.
 */
function fitNymphaeum(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 1, ctx.wallTop, ashlar(ctx));
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const accent = ctx.style["foundation.accent"] as string;

  // The screen: the far interior row, built up in dressed stone with a niche
  // every other bay. It stands on the floor plane the shell laid, so nothing
  // in it floats, and it takes the far row out of the walkable floor without
  // stranding anything — every remaining cell is still reachable round it.
  //
  // **It stops one course under the ceiling, always.** The storey band the
  // physics lint reads runs from `floor + 1` to `floor + storyHeight - 1`, and
  // a column solid across the whole of that band is `interior.blocked_column`
  // whatever it was built as — a chimney flue, a crate on a crate, or a
  // fountain screen. The first version was `storyHeight - 1` high and filled
  // the band exactly, which the terrarium found once per non-niche bay per
  // exhibit cell. A screen is a piece of furniture standing against a wall,
  // not a second wall, so it gets `storyHeight - 2` and the daylight over it
  // is part of the read.
  //
  // **And it asks `free` first, cell by cell.** The screen is the one thing in
  // this file that writes standing masonry without going through
  // {@link PropCounter}, and `free` is where the ground floor keeps the
  // reserve every fit-out has to honour: the stair columns, the hearth, the
  // door and the cell inside it. The terrarium found this the expensive way —
  // the shell puts its stair against a wall, the far wall row is a wall, and a
  // screen built over the bottom of the flight is an **upper storey with no
  // way up to it**: `traversal.unreachable`, one finding per cell of the floor
  // above. A niche where the stair is, is a better fountain anyway.
  const head = Math.max(1, Math.min(3, ctx.storyHeight - 2));
  for (let x = it.x0; x <= it.x1; x++) {
    if (!ctx.free(x, end.z)) continue;
    const niche = (x - it.x0) % 2 === 1;
    for (let y = 1; y <= head; y++) {
      if (niche && y <= 2) continue;
      ctx.put(x, y, end.z, y === head ? accent : "smooth_stone");
      c.n++;
    }
    if (!niche) continue;
    // The niche back is the wall behind it; the light stands in the recess,
    // on the floor, so it needs nothing to hang from.
    ctx.put(x, 1, end.z, "lantern", { hanging: "false", waterlogged: "false" });
    c.n++;
  }

  // The basin: **one** row of water, held one cell clear of the screen and one
  // cell clear of both flanks, with a coping of dressed stone round it.
  //
  // Every clause of that sentence is a walking route, and the shape came from
  // the terrarium the hard way. Water is a floor a player cannot stand on, so
  // a basin is a **hole in the walkable floor** and it obeys the same law as
  // any other hole:
  //
  // - **one cell clear of the screen**, because the niches are floor. Two rows
  //   of water against the screen left every niche a pocket reachable only by
  //   swimming — `traversal.unreachable`, on the ground storey;
  // - **one cell clear of both flanks**, so the dry walk round the basin is a
  //   ring rather than a cul-de-sac. A basin that touches a side wall cuts the
  //   room in two and strands whatever is behind it, the stair foot included;
  // - **never on a cell `free` has reserved**, which is the stair and the way
  //   in, and never on the lantern row.
  const wet = end.z === it.z0 ? it.z0 + 2 : it.z1 - 2;
  const x0 = it.x0 + 1;
  const x1 = it.x1 - 1;
  const inPool = (x: number, z: number): boolean =>
    x >= x0 && x <= x1 && z === wet && ctx.free(x, z);
  if (x1 >= x0 && wet > it.z0 && wet < it.z1 && wet !== lamp.z) {
    for (let x = x0; x <= x1; x++) {
      if (!inPool(x, wet)) continue;
      ctx.put(x, 0, wet, "water", { level: "0" });
      c.n++;
    }
    // The coping: dressed stone written into the floor plane all the way round
    // the water, which is what turns a wet floor into a basin.
    for (let z = it.z0; z <= it.z1; z++) {
      for (let x = it.x0; x <= it.x1; x++) {
        if (inPool(x, z)) continue;
        if (!inPool(x + 1, z) && !inPool(x - 1, z) && !inPool(x, z + 1) && !inPool(x, z - 1)) {
          continue;
        }
        ctx.put(x, 0, z, "smooth_stone");
        c.n++;
      }
    }
  }

  // The benches a fountain is looked at from, on the wall row opposite, and a
  // pot at each end of them. Nothing stands in the lantern column.
  const nearZ = end.z === it.z0 ? it.z1 : it.z0;
  const seat = ctx.style["stair.interior"] as string;
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if (x === lamp.x && nearZ === lamp.z) continue;
    c.put1(x, nearZ, seat, { facing: opposite(end.look), half: "bottom", shape: "straight" });
  }
  c.put1(it.x0, nearZ, pottedAt(it.x0, nearZ));
  c.put1(it.x1, nearZ, pottedAt(it.x1, nearZ));
}

/* -------------------------------------------------------------------------- */
/* the olive press                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `olive_press` — a stone trough, a beam over it and the jars it fills.
 *
 * The smallest building in the pack and the one that does the most work for a
 * rural prompt: an ancient countryside is olives, and an olive press is the
 * only building that says so. The read is the **beam** — a run of logs at head
 * height across the room with the weight stone hung on its end, which is the
 * one thing in a press a visitor can see from the door.
 *
 * Everything inside goes through {@link PropCounter}: the beam is a `stack`
 * course, so the headroom guard refuses it wherever it would seal a column,
 * and the trough is a `put1` run, so the connectivity guard refuses it
 * wherever it would strand the floor.
 */
function fitOlivePress(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) c.n += reclad(ctx, plan, 1, Math.min(2, ctx.wallTop), masonry(ctx));

  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const slabBlock = ctx.style["stone.slab"] as string;

  // The trough: a run of dressed stone with slab lips, one column off the
  // middle so nobody has to stand under the lantern to work at it.
  const tx = lamp.x - 1 >= it.x0 ? lamp.x - 1 : lamp.x + 1;
  const from = end.z === it.z0 ? it.z0 + 1 : it.z0;
  const to = end.z === it.z0 ? it.z1 : it.z1 - 1;
  for (let z = from; z <= Math.min(to, from + 2); z++) {
    if (z === lamp.z && tx === lamp.x) continue;
    if (c.put1(tx, z, "smooth_stone")) {
      c.stack(tx, z, 2, slabBlock, { type: "bottom", waterlogged: "false" });
    }
  }

  // The beam: a course of logs running the width of the room over the trough,
  // with the weight stone hung on its far end. Each log stands beside its
  // neighbour and the run lands on the wall row at both ends, so nothing in it
  // is a full cube with six air faces.
  //
  // It goes at **`y = 3`, or not at all**, and that is the lesson this
  // building cost: a beam at `y = 2` is a beam through the *walking* band —
  // the physics reading of a walkable cell is "air at `y = 1` and air at
  // `y = 2`" — so a beam across the room at head height cuts the floor in two
  // however walkable each half of it is. Under a three-course storey there is
  // no course above the walking band, so the press keeps its trough and loses
  // its beam rather than losing its room.
  const beamZ = Math.min(to, from + 1);
  const log = ctx.style["wall.accent"] as string;
  if (ctx.storyHeight >= 4 && beamZ !== lamp.z) {
    let beamCells = 0;
    for (let x = it.x0; x <= it.x1; x++) {
      if (c.stack(x, beamZ, 3, log, { axis: "x" })) beamCells++;
    }
    if (beamCells > 0) {
      const wx = it.x1 === lamp.x ? it.x1 - 1 : it.x1;
      c.stack(wx, beamZ, 3, "chiseled_stone_bricks");
    }
  }

  // The jars, ranked along the far wall — and one of them a pithos proper.
  for (let x = it.x0; x <= it.x1; x += 2) {
    if (x === lamp.x && end.z === lamp.z) continue;
    if (x === tx) continue;
    c.put1(
      x,
      end.z,
      (x - it.x0) % 4 === 0
        ? "cauldron"
        : "decorated_pot",
      (x - it.x0) % 4 === 0
        ? undefined
        : { cracked: "false", facing: opposite(end.look), waterlogged: "false" },
    );
  }

  // The pressing floor's odds and ends: a basket of fruit and a pot by the door.
  const nearZ = end.z === it.z0 ? it.z1 : it.z0;
  if (it.x0 !== tx) c.put1(it.x0, nearZ, "composter", { level: "3" });
  if (it.x1 !== tx) c.put1(it.x1, nearZ, pottedAt(it.x1, nearZ));
}
/* -------------------------------------------------------------------------- */
/* descriptors — Phase 4 registry (ordered, no side effects)                    */
/* -------------------------------------------------------------------------- */

/**
 * Ordered building descriptors for the classical-mediterranean (second half) pack.
 *
 * - Order is `CLASSICAL_B_BUILDING_ARCHETYPES` order (ship_shed → nymphaeum →
 *   olive_press), which is the priority `classicalBArchetypeOfTags` encodes and
 *   the global `archetypeOfTags` chain preserves (consulted straight after the
 *   siegeworks pack).
 * - `tags`/`aliases` are the exact witnesses from `classicalBArchetypeOfTags`:
 *   `ship_shed` answers to `ship_shed`/`neosoikos` only — bare `shed`,
 *   `boat_shed` and `slipway` are **deliberately unclaimed** (the boathouse and
 *   shipyard own them); this is the "ship-shed behavior" the assignment calls
 *   out. `nymphaeum` answers to `nymphaeum`/`monumental_fountain` only — bare
 *   `fountain`/`well`/`spring` remain the prop's; bare `press`/`mill`/`arch`
 *   remain the windmill/memorial arch's. Every non-claim the header documents
 *   is preserved.
 * - `facadeDefaults` via `classicalBFacadeDefaults` (nullable per-field),
 *   `furnish` is the leaf handle `furnishClassicalB` (LocalVoxelOp order and
 *   seeded draws stay in the `fit*` callees, including the ship-shed's
 *   `openFront` lintel continuity).
 * - `dispatch` is `standard` for all three.
 * - No self-registration; existing exports retained.
 */
export const CLASSICAL_B_BUILDING_DESCRIPTORS = defineBuildingDescriptors<
  ClassicalBBuildingArchetype,
  FitOutContext
>(CLASSICAL_B_BUILDING_ARCHETYPES, {
  tags: (id) => {
    switch (id) {
      case "ship_shed":
        return ["ship_shed"];
      case "nymphaeum":
        return ["nymphaeum"];
      case "olive_press":
        return ["olive_press"];
      default:
        return [id];
    }
  },
  aliases: (id) => {
    switch (id) {
      case "ship_shed":
        return ["neosoikos"];
      case "nymphaeum":
        return ["monumental_fountain"];
      case "olive_press":
        return ["oil_press", "olive_mill"];
      default:
        return [];
    }
  },
  facadeDefaults: (id) => classicalBFacadeDefaults(id),
  furnish: furnishClassicalB,
  dispatch: "standard",
});
